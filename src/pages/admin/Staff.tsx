import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, getDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { db, createUserWithoutSignIn, verifyCredentials } from '@/lib/firebase';
import { getAuthErrorMessage } from '@/lib/authErrors';
import { uploadImage } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';
import Portal from '@/components/shared/Portal';
import PageHeader from '@/components/shared/PageHeader';
import type { Staff } from '@/types';
import {
  Plus, Search, Edit2, Trash2, X, User, Shield,
  ToggleLeft, ToggleRight, Loader2, CreditCard, Eye, EyeOff, Camera
} from 'lucide-react';
import toast from 'react-hot-toast';

const defaultStaff = {
  displayName: '', email: '', role: 'staff' as const,
  isActive: true, rfidTag: '', photoURL: '',
};

export default function AdminStaff() {
  const { currentUser } = useAuth();
  const [staff, setStaff]       = useState<Staff[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<Partial<Staff> & { password?: string; rfidPassword?: string }>(defaultStaff);
  const [editId, setEditId]     = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showRfidPass, setShowRfidPass] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchStaff(); }, []);

  async function fetchStaff() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(file);
      setEditStaff(p => ({ ...p, photoURL: url }));
      toast.success('Photo uploaded');
    } catch {
      toast.error('Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!editStaff.displayName?.trim() || !editStaff.email?.trim()) {
      toast.error('Name and email are required'); return;
    }
    if (!editId && (!editStaff.password || editStaff.password.length < 6)) {
      toast.error('Password must be at least 6 characters'); return;
    }
    if (editId && editId === currentUser?.id && (editStaff.role !== 'admin' || editStaff.isActive === false)) {
      toast.error("You can't remove your own admin access"); return;
    }
    const email  = editStaff.email.trim();
    // Admins never get an RFID card: a card holds its owner's password and anyone
    // who knows the tag can read it. Saving an admin also removes any card they had.
    const isAdminRole = editStaff.role === 'admin';
    const newTag = isAdminRole ? '' : (editStaff.rfidTag || '').trim();
    const oldTag = (staff.find(s => s.id === editId)?.rfidTag || '').trim();
    const tagChanged = newTag !== oldTag;
    if (newTag.includes('/')) {
      toast.error('RFID tag cannot contain "/"'); return;
    }
    // Saving a card overwrites rfidCards/{tag}, which would silently take the
    // tag (and the login behind it) away from whoever already has it.
    const tagOwner = newTag && tagChanged ? staff.find(s => s.id !== editId && s.rfidTag?.trim() === newTag) : undefined;
    if (tagOwner) {
      toast.error(`This RFID tag is already assigned to ${tagOwner.displayName}`); return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const data: Partial<Staff> = {
        displayName: editStaff.displayName.trim(),
        email,
        role: editStaff.role,
        isActive: editStaff.isActive ?? true,
        rfidTag: newTag,
        photoURL: editStaff.photoURL || '',
        updatedAt: now,
      };
      if (editId) {
        // The card stored under the old tag — only reuse/revoke it if it's really this staff's.
        let oldCard: { password?: string } | null = null;
        if (oldTag && tagChanged) {
          const snap = await getDoc(doc(db, 'rfidCards', oldTag));
          if (snap.exists() && snap.data().userId === editId) oldCard = snap.data();
        }

        let cardPassword = editStaff.rfidPassword || '';
        if (newTag && cardPassword) {
          // Confirm the password really matches this staff's login BEFORE
          // saving the card, so the RFID card can never hold a wrong password.
          try {
            await verifyCredentials(email, cardPassword);
          } catch (err) {
            if (err instanceof FirebaseError && err.code === 'auth/too-many-requests') {
              toast.error('Too many attempts. Please wait a few minutes, then try again.');
            } else {
              toast.error("That password doesn't match this staff's login. Enter their exact account password.");
            }
            setSaving(false);
            return;
          }
        } else if (newTag && tagChanged) {
          // New tag, password left blank: carry the saved credentials over to it.
          cardPassword = oldCard?.password || '';
          if (!cardPassword) {
            toast.error("Enter the staff's login password to set up this RFID card");
            return;
          }
        }

        // One atomic write: the profile, the new card, and revoking the old card.
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', editId), data);
        if (newTag && cardPassword) {
          batch.set(doc(db, 'rfidCards', newTag), {
            email,
            password: cardPassword,
            userId: editId,
            staffName: data.displayName,
            updatedAt: now,
          });
        }
        if (oldCard) batch.delete(doc(db, 'rfidCards', oldTag));
        await batch.commit();
        toast.success(
          newTag && cardPassword ? 'Staff updated & RFID credentials saved'
          : isAdminRole && oldCard ? "Staff updated — RFID card removed (admins can't use RFID)"
          : 'Staff updated'
        );
      } else {
        // Create the account on a secondary app so the admin stays logged in.
        // If saving the profile fails, the new login is rolled back.
        await createUserWithoutSignIn(email, editStaff.password!, async (newUid) => {
          const batch = writeBatch(db);
          batch.set(doc(db, 'users', newUid), { ...data, createdAt: now });
          if (newTag) {
            batch.set(doc(db, 'rfidCards', newTag), {
              email,
              password: editStaff.password,
              userId: newUid,
              staffName: data.displayName,
              createdAt: now,
            });
          }
          await batch.commit();
        });
        toast.success('Staff account created');
      }
      setModalOpen(false);
      setEditId(null);
      setEditStaff(defaultStaff);
      fetchStaff();
    } catch (err) {
      toast.error(getAuthErrorMessage(err, 'Failed to save staff'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (id === currentUser?.id) { toast.error("You can't delete your own account"); return; }
    const member = staff.find(s => s.id === id);
    if (!confirm('Delete this staff member? They will lose access immediately and their RFID card will stop working.')) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', id));
      // Also remove their RFID card so a deleted staff can't tap in — but only
      // if the card is really theirs (an old duplicate tag may point elsewhere).
      const tag = member?.rfidTag?.trim();
      if (tag) {
        const card = await getDoc(doc(db, 'rfidCards', tag));
        if (card.exists() && card.data().userId === id) batch.delete(card.ref);
      }
      await batch.commit();
      setStaff(prev => prev.filter(s => s.id !== id));
      toast.success('Staff deleted');
    } catch { toast.error('Failed to delete'); }
  }

  async function handleToggle(s: Staff) {
    if (s.id === currentUser?.id) { toast.error("You can't deactivate your own account"); return; }
    try {
      await updateDoc(doc(db, 'users', s.id), { isActive: !s.isActive });
      setStaff(prev => prev.map(x => x.id === s.id ? { ...x, isActive: !x.isActive } : x));
    } catch { toast.error('Failed to update'); }
  }

  function openAdd()     { setEditStaff(defaultStaff); setEditId(null); setModalOpen(true); }
  function openEdit(s: Staff) { setEditStaff({ ...s }); setEditId(s.id); setModalOpen(true); }

  const filtered     = staff.filter(s =>
    s.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );
  const admins       = filtered.filter(s => s.role === 'admin');
  const staffMembers = filtered.filter(s => s.role === 'staff');

  const previewInitials = editStaff.displayName
    ? editStaff.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Our Team"
        title="Staff Management"
        subtitle={`${staff.length} total accounts`}
        actions={
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Staff
          </button>
        }
      />

      <div className="relative sm:max-w-sm">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-400" />
        <input className="input pl-11 bg-cream-50" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {admins.length > 0 && (
        <div>
          <h2 className="font-display text-xl text-espresso-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-espresso-800 text-caramel-200 flex items-center justify-center"><Shield className="w-4 h-4" /></span>
            Administrators
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {admins.map(s => (
              <StaffCard key={s.id} staff={s} isSelf={s.id === currentUser?.id} onEdit={() => openEdit(s)} onDelete={handleDelete} onToggle={handleToggle} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-xl text-espresso-900 mb-3 flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-cream-200 text-caramel-700 flex items-center justify-center"><User className="w-4 h-4" /></span>
          Staff Members
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-cream-300/60 rounded-full" />
                  <div className="flex-1"><div className="h-4 bg-cream-300/60 rounded-full mb-1.5" /><div className="h-3 bg-cream-200 rounded-full w-2/3" /></div>
                </div>
              </div>
            ))}
          </div>
        ) : staffMembers.length === 0 ? (
          <div className="card text-center py-12 text-bark-400">
            <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No staff members found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffMembers.map(s => (
              <StaffCard key={s.id} staff={s} isSelf={s.id === currentUser?.id} onEdit={() => openEdit(s)} onDelete={handleDelete} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <Portal>
        <div className="modal-backdrop">
          <div className="modal-panel max-w-md max-h-[90vh] overflow-y-auto">
            <div className="modal-header">
              <div>
                <p className="eyebrow text-2xl -mb-1">{editId ? 'Update' : 'Welcome aboard'}</p>
                <h2 className="font-display text-2xl text-espresso-900">{editId ? 'Edit Staff' : 'Add Staff'}</h2>
              </div>
              <button onClick={() => setModalOpen(false)} className="icon-btn"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">

              {/* ── Photo upload ── */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-caramel-200 to-cream-300 ring-4 ring-cream-50 shadow-md flex items-center justify-center">
                    {editStaff.photoURL
                      ? <img src={editStaff.photoURL} alt="" className="w-full h-full object-cover" />
                      : <span className="text-espresso-700 font-display font-semibold text-3xl">{previewInitials}</span>
                    }
                  </div>
                  <button
                    type="button"
                    onClick={() => photoRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-espresso-800 hover:bg-espresso-700 text-cream-50 rounded-full flex items-center justify-center shadow-md ring-2 ring-cream-50 transition-colors"
                  >
                    {uploadingPhoto
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Camera className="w-3.5 h-3.5" />
                    }
                  </button>
                  <input
                    ref={photoRef} type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      e.target.value = ''; // so picking the same file again (e.g. after a failed upload) still fires
                      if (file) handlePhotoUpload(file);
                    }}
                  />
                </div>
                <p className="text-xs text-bark-400">Click camera to upload photo</p>
              </div>

              <div>
                <label className="label">Full Name *</label>
                <input className="input" placeholder="e.g., Juan dela Cruz"
                  value={editStaff.displayName || ''}
                  onChange={e => setEditStaff(p => ({ ...p, displayName: e.target.value }))} />
              </div>

              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" placeholder="staff@yourshop.com"
                  value={editStaff.email || ''}
                  onChange={e => setEditStaff(p => ({ ...p, email: e.target.value }))}
                  disabled={!!editId} />
              </div>

              {!editId && (
                <div>
                  <label className="label">Password *</label>
                  <div className="relative">
                    <input className="input pr-11" type={showPass ? 'text' : 'password'}
                      placeholder="Min. 6 characters"
                      value={editStaff.password || ''}
                      onChange={e => setEditStaff(p => ({ ...p, password: e.target.value }))} />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-400 hover:text-espresso-800">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Role</label>
                <div className="segmented">
                  {(['admin', 'staff'] as const).map(r => (
                    <button key={r} onClick={() => setEditStaff(p => ({ ...p, role: r }))}
                      disabled={!!editId && editId === currentUser?.id}
                      title={editId && editId === currentUser?.id ? "You can't change your own role" : undefined}
                      className={`segmented-item capitalize disabled:cursor-not-allowed disabled:opacity-60 ${
                        editStaff.role === r ? 'active' : ''
                      }`}>
                      {r === 'admin' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />} {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* RFID Section */}
              <div className="space-y-3 p-4 bg-cream-200/50 rounded-3xl border border-cream-300">
                <p className="text-sm font-semibold text-espresso-800 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-espresso-800 text-caramel-200 flex items-center justify-center"><CreditCard className="w-3.5 h-3.5" /></span>
                  RFID Login Setup
                </p>
                {editStaff.role === 'admin' ? (
                  /* Admins can't use RFID — fields hidden, typed tag kept in state for if the role flips back */
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-cream-50 border border-cream-300 text-xs text-bark-600 leading-relaxed">
                    <Shield className="w-4 h-4 text-caramel-600 flex-shrink-0 mt-0.5" />
                    <p>
                      Admin accounts can't use RFID — they sign in with email and password (or Google).
                      {editId && staff.find(s => s.id === editId)?.rfidTag && (
                        <span className="block mt-1 font-semibold text-amber-700">Saving will remove this account's RFID card.</span>
                      )}
                    </p>
                  </div>
                ) : (<>
                <div>
                  <label className="label">RFID Tag</label>
                  <input className="input font-mono" placeholder="Scan or type RFID tag"
                    value={editStaff.rfidTag || ''}
                    onChange={e => setEditStaff(p => ({ ...p, rfidTag: e.target.value }))} />
                </div>
                {editId && editStaff.rfidTag && (
                  <div>
                    <label className="label">
                      Staff Login Password
                      <span className="text-bark-400 font-normal ml-1">(their exact account password)</span>
                    </label>
                    <div className="relative">
                      <input className="input pr-11" type={showRfidPass ? 'text' : 'password'}
                        placeholder="Enter staff's password"
                        value={editStaff.rfidPassword || ''}
                        onChange={e => setEditStaff(p => ({ ...p, rfidPassword: e.target.value }))} />
                      <button type="button" onClick={() => setShowRfidPass(!showRfidPass)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-400 hover:text-espresso-800">
                        {showRfidPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-bark-400 mt-1.5 px-1">Must match the staff's login password. Leave blank to keep existing RFID credentials unchanged.</p>
                  </div>
                )}
                {!editId && editStaff.rfidTag && editStaff.password && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    ✓ RFID login will be automatically configured using the password above.
                  </p>
                )}
                {!editId && editStaff.rfidTag && !editStaff.password && (
                  <p className="text-xs text-amber-600">Set a password above to enable RFID login for this staff.</p>
                )}
                </>)}
              </div>

              <label htmlFor="isActive" className="flex items-center gap-3 px-4 py-3 rounded-full bg-cream-200/60 border border-cream-300 cursor-pointer">
                <input type="checkbox" id="isActive" checked={editStaff.isActive ?? true}
                  onChange={e => setEditStaff(p => ({ ...p, isActive: e.target.checked }))}
                  disabled={!!editId && editId === currentUser?.id}
                  className="w-4 h-4 accent-espresso-700" />
                <span className="text-sm text-espresso-800">Active account</span>
              </label>
            </div>

            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving || uploadingPhoto} className="btn-primary flex-1">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}

function StaffCard({ staff, isSelf, onEdit, onDelete, onToggle }: {
  staff: Staff;
  /** The signed-in admin's own card: can't be deactivated or deleted (would lock them out). */
  isSelf: boolean;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggle: (s: Staff) => void;
}) {
  const initials = staff.displayName
    ?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div className={`card p-5 relative overflow-hidden ${!staff.isActive ? 'opacity-60' : ''}`}>
      <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full bg-caramel-200/25 blur-2xl pointer-events-none" />
      <div className="relative flex items-start gap-3 mb-3">
        {/* Avatar — photo if available, else initials */}
        <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-caramel-200 to-cream-300 ring-2 ring-cream-50 shadow-sm flex items-center justify-center">
          {staff.photoURL
            ? <img src={staff.photoURL} alt={staff.displayName} className="w-full h-full object-cover" />
            : <span className="text-espresso-700 font-semibold text-lg font-display">{initials}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-espresso-900 truncate">{staff.displayName}</p>
          <p className="text-xs text-bark-400 truncate">{staff.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={staff.role === 'admin' ? 'badge-dark' : 'badge-info'}>
              {staff.role}
            </span>
            {!staff.isActive && <span className="badge badge-danger">Inactive</span>}
            {isSelf && <span className="badge bg-caramel-100 text-caramel-800 normal-case">You</span>}
          </div>
        </div>
      </div>

      {staff.rfidTag && (
        <div className="relative flex items-center gap-1.5 text-xs text-bark-500 mb-3 px-3 py-1.5 bg-cream-200/60 rounded-full w-fit max-w-full">
          <CreditCard className="w-3 h-3 flex-shrink-0 text-caramel-600" />
          <span className="font-mono truncate">{staff.rfidTag}</span>
        </div>
      )}

      <div className="relative flex items-center gap-2 pt-3 border-t border-cream-300/70">
        <button
          onClick={() => onToggle(staff)}
          disabled={isSelf}
          title={isSelf ? "You can't deactivate your own account" : undefined}
          className="text-bark-400 hover:text-espresso-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs"
        >
          {staff.isActive ? <ToggleRight className="w-6 h-6 text-emerald-600" /> : <ToggleLeft className="w-6 h-6" />}
          <span>{staff.isActive ? 'Active' : 'Inactive'}</span>
        </button>
        <button onClick={onEdit} className="ml-auto btn-ghost py-1.5 px-3 text-xs">
          <Edit2 className="w-3.5 h-3.5" /> Edit
        </button>
        {!isSelf && (
          <button onClick={() => onDelete(staff.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-bark-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete staff">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
