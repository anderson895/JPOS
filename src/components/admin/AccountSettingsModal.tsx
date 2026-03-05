import { useState, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import {
  updatePassword, updateProfile,
  EmailAuthProvider, reauthenticateWithCredential, reload
} from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { uploadImage } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';
import { X, User, Lock, Camera, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  onClose: () => void;
}

export default function AccountSettingsModal({ onClose }: Props) {
  const { currentUser, refreshUser } = useAuth();

  const initials = currentUser?.displayName
    ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'A';

  const [activeTab, setActiveTab]           = useState<'profile' | 'password'>('profile');

  // Profile state — initialised from currentUser so form always shows latest values
  const [displayName, setDisplayName]       = useState(currentUser?.displayName || '');
  const [photoURL, setPhotoURL]             = useState(currentUser?.photoURL || '');
  const [savingProfile, setSavingProfile]   = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  // Password state
  const [currentPw, setCurrentPw]         = useState('');
  const [newPw, setNewPw]                 = useState('');
  const [confirmPw, setConfirmPw]         = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw]         = useState(false);
  const [savingPw, setSavingPw]           = useState(false);

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(file);
      setPhotoURL(url);
      toast.success('Photo uploaded');
    } catch {
      toast.error('Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveProfile() {
    if (!displayName.trim()) { toast.error('Name is required'); return; }
    setSavingProfile(true);
    try {
      const fbUser = auth.currentUser;
      if (!fbUser) throw new Error('Not authenticated');

      // 1. Update Firebase Auth displayName + photoURL
      await updateProfile(fbUser, {
        displayName: displayName.trim(),
        photoURL: photoURL || null,
      });

      // 2. Force Firebase Auth to reflect the new values immediately
      await reload(fbUser);

      // 3. Persist to Firestore
      if (currentUser?.id) {
        await updateDoc(doc(db, 'users', currentUser.id), {
          displayName: displayName.trim(),
          photoURL: photoURL || '',
          updatedAt: new Date().toISOString(),
        });
      }

      // 4. Re-fetch Firestore doc → update context → sidebar refreshes without reload
      await refreshUser();

      toast.success('Profile updated');
      onClose();
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPw)          { toast.error('Enter your current password'); return; }
    if (newPw.length < 6)    { toast.error('New password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    setSavingPw(true);
    try {
      const fbUser = auth.currentUser;
      if (!fbUser?.email) throw new Error('No user');
      // Re-authenticate before changing password (Firebase requirement)
      const credential = EmailAuthProvider.credential(fbUser.email, currentPw);
      await reauthenticateWithCredential(fbUser, credential);
      await updatePassword(fbUser, newPw);
      toast.success('Password changed successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/wrong-password') toast.error('Current password is incorrect');
      else toast.error('Failed to change password');
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-cream-100">
          <h2 className="font-display text-xl text-espresso-900">Account Settings</h2>
          <button onClick={onClose} className="text-bark-400 hover:text-bark-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-cream-100">
          {(['profile', 'password'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-espresso-600 text-espresso-700'
                  : 'border-transparent text-bark-400 hover:text-bark-700'
              }`}
            >
              {tab === 'profile' ? <User className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Profile Tab ── */}
        {activeTab === 'profile' && (
          <div className="p-6 space-y-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-espresso-100 flex items-center justify-center">
                  {photoURL
                    ? <img src={photoURL} alt="" className="w-full h-full object-cover" />
                    : <span className="text-espresso-600 font-bold text-2xl">{initials}</span>
                  }
                </div>
                <button
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
              <p className="text-xs text-bark-400">Click the camera icon to change photo</p>
            </div>

            <div>
              <label className="label">Display Name</label>
              <input
                className="input" placeholder="Your full name"
                value={displayName} onChange={e => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input bg-cream-50 text-bark-500 cursor-not-allowed"
                value={currentUser?.email || ''} readOnly />
            </div>
            <div>
              <label className="label">Role</label>
              <input className="input bg-cream-50 text-bark-500 cursor-not-allowed capitalize"
                value={currentUser?.role || ''} readOnly />
            </div>
          </div>
        )}

        {/* ── Password Tab ── */}
        {activeTab === 'password' && (
          <div className="p-6 space-y-4">
            <div>
              <label className="label">Current Password</label>
              <div className="relative">
                <input
                  className="input pr-10" type={showCurrentPw ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                />
                <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-bark-400 hover:text-bark-700">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <input
                  className="input pr-10" type={showNewPw ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  value={newPw} onChange={e => setNewPw(e.target.value)}
                />
                <button type="button" onClick={() => setShowNewPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-bark-400 hover:text-bark-700">
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input
                className="input" type="password" placeholder="Repeat new password"
                value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
              />
              {confirmPw && newPw !== confirmPw && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-cream-100">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          {activeTab === 'profile' ? (
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile || uploadingPhoto}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          ) : (
            <button
              onClick={handleChangePassword}
              disabled={savingPw || !currentPw || !newPw || newPw !== confirmPw}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingPw ? 'Updating…' : 'Change Password'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}