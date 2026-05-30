import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { db, createUserWithoutSignIn, verifyCredentials } from '@/lib/firebase';
import { getAuthErrorMessage } from '@/lib/authErrors';
import { uploadImage } from '@/lib/cloudinary';
import Portal from '@/components/shared/Portal';
import type { Staff } from '@/types';
import {
  Plus, Search, Edit2, Trash2, X, User, Shield,
  ToggleLeft, ToggleRight, Loader2, CreditCard, Eye, EyeOff, Camera, Upload
} from 'lucide-react';
import toast from 'react-hot-toast';

const defaultStaff = {
  displayName: '', email: '', role: 'staff' as const,
  isActive: true, rfidTag: '', photoURL: '',
};

export default function AdminStaff() {
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
    setSaving(true);
    try {
      const data: Partial<Staff> = {
        displayName: editStaff.displayName.trim(),
        email: editStaff.email.trim(),
        role: editStaff.role,
        isActive: editStaff.isActive ?? true,
        rfidTag: editStaff.rfidTag || '',
        photoURL: editStaff.photoURL || '',
        updatedAt: new Date().toISOString(),
      };
      if (editId) {
        if (editStaff.rfidTag && editStaff.rfidPassword) {
          // Confirm the password really matches this staff's login BEFORE
          // saving the card, so the RFID card can never hold a wrong password.
          try {
            await verifyCredentials(editStaff.email!.trim(), editStaff.rfidPassword);
          } catch (err) {
            if (err instanceof FirebaseError && err.code === 'auth/too-many-requests') {
              toast.error('Too many attempts. Please wait a few minutes, then try again.');
            } else {
              toast.error("That password doesn't match this staff's login. Enter their exact account password.");
            }
            setSaving(false);
            return;
          }
        }
        await updateDoc(doc(db, 'users', editId), data);
        if (editStaff.rfidTag && editStaff.rfidPassword) {
          await setDoc(doc(db, 'rfidCards', editStaff.rfidTag.trim()), {
            email: editStaff.email!.trim(),
            password: editStaff.rfidPassword,
            userId: editId,
            staffName: editStaff.displayName,
            updatedAt: new Date().toISOString(),
          });
          toast.success('Staff updated & RFID credentials saved');
        } else {
          toast.success('Staff updated');
        }
      } else {
        // Create the account on a secondary app so the admin stays logged in.
        const newUid = await createUserWithoutSignIn(editStaff.email!.trim(), editStaff.password!);
        await setDoc(doc(db, 'users', newUid), { ...data, createdAt: new Date().toISOString() });
        if (editStaff.rfidTag) {
          await setDoc(doc(db, 'rfidCards', editStaff.rfidTag.trim()), {
            email: editStaff.email!.trim(),
            password: editStaff.password,
            userId: newUid,
            staffName: editStaff.displayName,
            createdAt: new Date().toISOString(),
          });
        }
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
    const member = staff.find(s => s.id === id);
    if (!confirm('Delete this staff member? They will lose access immediately and their RFID card will stop working.')) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      // Also remove their RFID card so a deleted staff can't tap in.
      if (member?.rfidTag) {
        try { await deleteDoc(doc(db, 'rfidCards', member.rfidTag.trim())); } catch { /* card already gone */ }
      }
      setStaff(prev => prev.filter(s => s.id !== id));
      toast.success('Staff deleted');
    } catch { toast.error('Failed to delete'); }
  }

  async function handleToggle(s: Staff) {
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-espresso-900">Staff Management</h1>
          <p className="text-bark-500 text-sm mt-0.5">{staff.length} total accounts</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      <div className="relative sm:max-w-xs">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-bark-400" />
        <input className="input pl-9" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {admins.length > 0 && (
        <div>
          <h2 className="font-display text-lg text-espresso-800 mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-espresso-600" /> Administrators
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {admins.map(s => (
              <StaffCard key={s.id} staff={s} onEdit={() => openEdit(s)} onDelete={handleDelete} onToggle={handleToggle} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-lg text-espresso-800 mb-3 flex items-center gap-2">
          <User className="w-5 h-5 text-bark-500" /> Staff Members
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-cream-200 rounded-full" />
                  <div className="flex-1"><div className="h-4 bg-cream-200 rounded mb-1" /><div className="h-3 bg-cream-100 rounded w-2/3" /></div>
                </div>
              </div>
            ))}
          </div>
        ) : staffMembers.length === 0 ? (
          <div className="text-center py-12 text-bark-400">
            <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No staff members found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffMembers.map(s => (
              <StaffCard key={s.id} staff={s} onEdit={() => openEdit(s)} onDelete={handleDelete} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <Portal>
        <div className="modal-backdrop">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-cream-100">
              <h2 className="font-display text-xl text-espresso-900">{editId ? 'Edit Staff' : 'Add Staff'}</h2>
              <button onClick={() => setModalOpen(false)}><X className="w-5 h-5 text-bark-400" /></button>
            </div>

            <div className="p-6 space-y-4">

              {/* ── Photo upload ── */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-espresso-100 flex items-center justify-center">
                    {editStaff.photoURL
                      ? <img src={editStaff.photoURL} alt="" className="w-full h-full object-cover" />
                      : <span className="text-espresso-600 font-bold text-2xl">{previewInitials}</span>
                    }
                  </div>
                  <button
                    type="button"
                    onClick={() => photoRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute -bottom-1 -right-1 w-7 h-7 bg-espresso-600 hover:bg-espresso-700 text-white rounded-full flex items-center justify-center shadow-md transition-colors"
                  >
                    {uploadingPhoto
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Camera className="w-3.5 h-3.5" />
                    }
                  </button>
                  <input
                    ref={photoRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
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
                <input className="input" type="email" placeholder="staff@coffeeshop.com"
                  value={editStaff.email || ''}
                  onChange={e => setEditStaff(p => ({ ...p, email: e.target.value }))}
                  disabled={!!editId} />
              </div>

              {!editId && (
                <div>
                  <label className="label">Password *</label>
                  <div className="relative">
                    <input className="input pr-10" type={showPass ? 'text' : 'password'}
                      placeholder="Min. 6 characters"
                      value={editStaff.password || ''}
                      onChange={e => setEditStaff(p => ({ ...p, password: e.target.value }))} />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-bark-400">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Role</label>
                <div className="flex gap-2">
                  {(['admin', 'staff'] as const).map(r => (
                    <button key={r} onClick={() => setEditStaff(p => ({ ...p, role: r }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all flex items-center justify-center gap-2 ${
                        editStaff.role === r ? 'bg-espresso-600 text-white' : 'bg-cream-100 text-bark-600 hover:bg-cream-200'
                      }`}>
                      {r === 'admin' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />} {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* RFID Section */}
              <div className="space-y-3 p-4 bg-cream-50 rounded-2xl border border-cream-200">
                <p className="text-sm font-medium text-espresso-700 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> RFID Login Setup
                </p>
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
                      <input className="input pr-10" type={showRfidPass ? 'text' : 'password'}
                        placeholder="Enter staff's password"
                        value={editStaff.rfidPassword || ''}
                        onChange={e => setEditStaff(p => ({ ...p, rfidPassword: e.target.value }))} />
                      <button type="button" onClick={() => setShowRfidPass(!showRfidPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-bark-400">
                        {showRfidPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-bark-400 mt-1">Must match the staff's login password. Leave blank to keep existing RFID credentials unchanged.</p>
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
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="isActive" checked={editStaff.isActive ?? true}
                  onChange={e => setEditStaff(p => ({ ...p, isActive: e.target.checked }))}
                  className="w-4 h-4 accent-espresso-600" />
                <label htmlFor="isActive" className="text-sm text-espresso-700 cursor-pointer">Active account</label>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-cream-100">
              <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving || uploadingPhoto} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60">
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

function StaffCard({ staff, onEdit, onDelete, onToggle }: {
  staff: Staff;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggle: (s: Staff) => void;
}) {
  const initials = staff.displayName
    ?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div className={`card p-5 ${!staff.isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar — photo if available, else initials */}
        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-espresso-100 flex items-center justify-center">
          {staff.photoURL
            ? <img src={staff.photoURL} alt={staff.displayName} className="w-full h-full object-cover" />
            : <span className="text-espresso-700 font-semibold text-lg font-display">{initials}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-espresso-800 truncate">{staff.displayName}</p>
          <p className="text-xs text-bark-400 truncate">{staff.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`badge ${staff.role === 'admin' ? 'bg-espresso-100 text-espresso-700' : 'badge-info'}`}>
              {staff.role}
            </span>
            {!staff.isActive && <span className="badge badge-danger">Inactive</span>}
          </div>
        </div>
      </div>

      {staff.rfidTag && (
        <div className="flex items-center gap-1.5 text-xs text-bark-400 mb-3 px-2 py-1.5 bg-cream-50 rounded-lg">
          <CreditCard className="w-3 h-3" />
          <span className="font-mono">{staff.rfidTag}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-cream-100">
        <button onClick={() => onToggle(staff)} className="text-bark-400 hover:text-espresso-600 transition-colors">
          {staff.isActive ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
        </button>
        <button onClick={onEdit} className="ml-auto btn-ghost py-1.5 px-3 text-xs flex items-center gap-1">
          <Edit2 className="w-3.5 h-3.5" /> Edit
        </button>
        <button onClick={() => onDelete(staff.id)} className="text-bark-300 hover:text-red-400 transition-colors p-1.5">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}