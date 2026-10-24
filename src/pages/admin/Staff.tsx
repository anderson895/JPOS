import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, updateDoc, doc, writeBatch, query, where, increment, serverTimestamp } from 'firebase/firestore';
import { db, createUserWithoutSignIn } from '@/lib/firebase';
import { currentTenantId, tenantDoc, tenantRef } from '@/lib/tenant';
import { hasAccess } from '@/lib/entitlements';
import { getAuthErrorMessage } from '@/lib/authErrors';
import { uploadImage } from '@/lib/cloudinary';
import { STORAGE_FULL, useStorage } from '@/lib/usage';
import { changes, logActivity } from '@/lib/activity';
import { useAuth } from '@/contexts/AuthContext';
import Portal from '@/components/shared/Portal';
import PageHeader from '@/components/shared/PageHeader';
import type { Staff } from '@/types';
import {
  Plus, Search, Edit2, Trash2, X, User, Shield,
  ToggleLeft, ToggleRight, Loader2, Eye, EyeOff, Camera
} from 'lucide-react';
import toast from 'react-hot-toast';

const defaultStaff = {
  displayName: '', email: '', role: 'staff' as const,
  isActive: true, rfidTag: '', photoURL: '',
};

export default function AdminStaff() {
  const { currentUser, tenant } = useAuth();
  // The package decides the number of accounts
  const staffLimit = tenant?.entitlements?.staffLimit ?? null;
  const canEdit = hasAccess(tenant);
  const [staff, setStaff]       = useState<Staff[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<Partial<Staff> & { password?: string }>(defaultStaff);
  const [editId, setEditId]     = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // New photos wait when the shop's storage is full
  const storage = useStorage();
  // The person being deleted or switched on/off (their card shows a spinner)
  const [busyId, setBusyId] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchStaff(); }, []);

  async function fetchStaff() {
    setLoading(true);
    try {
      // Only this shop's people (the rules also refuse any other list)
      const snap = await getDocs(query(collection(db, 'users'), where('tenantId', '==', currentTenantId())));
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    if (storage.full) { toast.error(STORAGE_FULL, { duration: 6000 }); return; }
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
    // RFID login was removed: saving someone clears their old card tag, and the
    // card (it held their password) is deleted below
    const oldTag = (staff.find(s => s.id === editId)?.rfidTag || '').trim();
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const data: Partial<Staff> = {
        displayName: editStaff.displayName.trim(),
        email,
        role: editStaff.role,
        isActive: editStaff.isActive ?? true,
        rfidTag: '',
        photoURL: editStaff.photoURL || '',
        updatedAt: now,
      };
      if (editId) {
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', editId), data);
        if (oldTag && !oldTag.includes('/')) batch.delete(tenantDoc('rfidCards', oldTag));
        await batch.commit();
        {
          const before = staff.find(s => s.id === editId);
          logActivity('staff.edit', data.displayName, changes([
            ['Name', before?.displayName, data.displayName],
            ['Role', before?.role, data.role],
          ]));
        }
        toast.success('Staff updated');
      } else {
        // Create the account on a secondary app so the admin stays logged in.
        // If saving the profile fails, the new login is rolled back.
        await createUserWithoutSignIn(email, editStaff.password!, async (newUid) => {
          const batch = writeBatch(db);
          batch.set(doc(db, 'users', newUid), { ...data, tenantId: currentTenantId(), createdAt: now });
          // Every account counts against the package (the rules check the pairing and the limit)
          batch.update(tenantRef(), { staffCount: increment(1), lastStaffChange: newUid, updatedAt: serverTimestamp() });
          await batch.commit();
        });
        toast.success('Staff account created');
        logActivity('staff.add', editStaff.displayName?.trim() || email, `Role: ${editStaff.role ?? 'staff'}`);
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
    if (!confirm('Delete this staff member? They will lose access immediately.')) return;
    setBusyId(id);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', id));
      batch.update(tenantRef(), { staffCount: increment(-1), lastStaffChange: id, updatedAt: serverTimestamp() });
      // Their old RFID card (it held their password), if they still have one
      const tag = member?.rfidTag?.trim();
      if (tag && !tag.includes('/')) batch.delete(tenantDoc('rfidCards', tag));
      await batch.commit();
      logActivity('staff.delete', member?.displayName || member?.email || '');
      setStaff(prev => prev.filter(s => s.id !== id));
      toast.success('Staff deleted');
    } catch { toast.error('Failed to delete'); }
    finally { setBusyId(null); }
  }

  async function handleToggle(s: Staff) {
    if (s.id === currentUser?.id) { toast.error("You can't deactivate your own account"); return; }
    setBusyId(s.id);
    try {
      await updateDoc(doc(db, 'users', s.id), { isActive: !s.isActive });
      logActivity(s.isActive ? 'staff.off' : 'staff.on', s.displayName || s.email);
      setStaff(prev => prev.map(x => x.id === s.id ? { ...x, isActive: !x.isActive } : x));
    } catch { toast.error('Failed to update'); }
    finally { setBusyId(null); }
  }

  function openAdd() {
    if (!canEdit) { toast.error('Start your free trial or subscribe to add staff.'); return; }
    if (staffLimit != null && (tenant?.staffCount ?? 0) >= staffLimit) {
      toast.error(`Your package allows ${staffLimit} accounts. Upgrade in Subscription to add more.`);
      return;
    }
    setEditStaff(defaultStaff); setEditId(null); setModalOpen(true);
  }
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
        subtitle={staffLimit != null ? `${tenant?.staffCount ?? staff.length} of ${staffLimit} accounts used (your package)` : `${staff.length} total accounts`}
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
              <StaffCard key={s.id} staff={s} isSelf={s.id === currentUser?.id} busy={busyId === s.id} onEdit={() => openEdit(s)} onDelete={handleDelete} onToggle={handleToggle} />
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
              <StaffCard key={s.id} staff={s} isSelf={s.id === currentUser?.id} busy={busyId === s.id} onEdit={() => openEdit(s)} onDelete={handleDelete} onToggle={handleToggle} />
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

function StaffCard({ staff, isSelf, busy, onEdit, onDelete, onToggle }: {
  staff: Staff;
  /** The signed-in admin's own card: can't be deactivated or deleted (would lock them out). */
  isSelf: boolean;
  /** Being deleted or switched on/off right now */
  busy: boolean;
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

      <div className="relative flex items-center gap-2 pt-3 border-t border-cream-300/70">
        <button
          onClick={() => onToggle(staff)}
          disabled={isSelf || busy}
          title={isSelf ? "You can't deactivate your own account" : undefined}
          className="text-bark-400 hover:text-espresso-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs"
        >
          {busy ? <span className="w-6 h-6 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-caramel-600" /></span>
            : staff.isActive ? <ToggleRight className="w-6 h-6 text-emerald-600" /> : <ToggleLeft className="w-6 h-6" />}
          <span>{staff.isActive ? 'Active' : 'Inactive'}</span>
        </button>
        <button onClick={onEdit} disabled={busy} className="ml-auto btn-ghost py-1.5 px-3 text-xs">
          <Edit2 className="w-3.5 h-3.5" /> Edit
        </button>
        {!isSelf && (
          <button onClick={() => onDelete(staff.id)} disabled={busy} className="w-8 h-8 rounded-full flex items-center justify-center text-bark-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete staff">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
