import { useState, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import {
  updatePassword, updateProfile,
  EmailAuthProvider, reauthenticateWithCredential, reload
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { db, auth } from '@/lib/firebase';
import { uploadImage } from '@/lib/cloudinary';
import { getAuthErrorMessage } from '@/lib/authErrors';
import { useAuth } from '@/contexts/AuthContext';
import Portal from '@/components/shared/Portal';
import ChangeEmailCard from '@/components/admin/ChangeEmail';
import { X, User, Lock, Camera, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  onClose: () => void;
}

export default function AccountSettingsModal({ onClose }: Props) {
  const { currentUser, refreshUser, isSuperAdmin } = useAuth();

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
      if (!fbUser.providerData.some(p => p.providerId === 'password')) {
        // Otherwise this would just report "Current password is incorrect"
        toast.error('This account signs in with Google, so it has no password to change here.');
        return;
      }
      // Re-authenticate before changing password (Firebase requirement)
      const credential = EmailAuthProvider.credential(fbUser.email, currentPw);
      await reauthenticateWithCredential(fbUser, credential);
      await updatePassword(fbUser, newPw);
      toast.success('Password changed successfully');

      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      onClose();
    } catch (err) {
      // Newer Firebase projects report a wrong password as auth/invalid-credential.
      const code = err instanceof FirebaseError ? err.code : '';
      if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(code)) {
        toast.error('Current password is incorrect');
      } else {
        toast.error(getAuthErrorMessage(err, 'Failed to change password'));
      }
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <Portal>
    <div className="modal-backdrop">
      <div className="modal-panel max-w-md overflow-hidden">

        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="eyebrow text-2xl -mb-1">Your profile</p>
            <h2 className="font-display text-2xl text-espresso-900">Account Settings</h2>
          </div>
          <button onClick={onClose} className="icon-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-5">
          <div className="segmented">
            {(['profile', 'password'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`segmented-item ${activeTab === tab ? 'active' : ''}`}
              >
                {tab === 'profile' ? <User className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Profile Tab ── */}
        {activeTab === 'profile' && (
          <div className="p-6 space-y-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-caramel-200 to-cream-300 ring-4 ring-cream-50 shadow-md flex items-center justify-center">
                  {photoURL
                    ? <img src={photoURL} alt="" className="w-full h-full object-cover" />
                    : <span className="text-espresso-700 font-display font-semibold text-3xl">{initials}</span>
                  }
                </div>
                <button
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
              <p className="text-xs text-bark-400">Click the camera icon to change photo</p>
            </div>

            <div>
              <label className="label">Display Name</label>
              <input
                className="input" placeholder="Your full name"
                value={displayName} onChange={e => setDisplayName(e.target.value)}
              />
            </div>
            {/* The JPOS owner can change their sign-in email (a code goes to the new one) */}
            {isSuperAdmin ? (
              <ChangeEmailCard className="rounded-3xl border border-cream-300/80 bg-cream-100/60 p-4" />
            ) : (
              <div>
                <label className="label">Email</label>
                <input className="input bg-cream-200/60 text-bark-500 cursor-not-allowed"
                  value={currentUser?.email || ''} readOnly />
              </div>
            )}
            <div>
              <label className="label">Role</label>
              <input className="input bg-cream-200/60 text-bark-500 cursor-not-allowed capitalize"
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
                  className="input pr-11" type={showCurrentPw ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                />
                <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-400 hover:text-espresso-800">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <input
                  className="input pr-11" type={showNewPw ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  value={newPw} onChange={e => setNewPw(e.target.value)}
                />
                <button type="button" onClick={() => setShowNewPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-400 hover:text-espresso-800">
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
                <p className="text-xs text-red-500 mt-1.5 px-1">Passwords do not match</p>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          {activeTab === 'profile' ? (
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile || uploadingPhoto}
              className="btn-primary flex-1"
            >
              {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          ) : (
            <button
              onClick={handleChangePassword}
              disabled={savingPw || !currentPw || !newPw || newPw !== confirmPw}
              className="btn-primary flex-1"
            >
              {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingPw ? 'Updating…' : 'Change Password'}
            </button>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
