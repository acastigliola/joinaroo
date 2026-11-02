'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { API_BASE_URL } from '../lib/api';

export default function ProfileSettings() {
  const { user, token, authReady, logout, updateProfile, uploadAvatar, openAuth } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setDisplayName(user.display_name);
      setIsPrivate(user.is_private);
    }
  }, [user]);

  if (!authReady) return null;

  if (!token || !user) {
    return (
      <div className="m-card">
        <h2>Account</h2>
        <p>Save events to your account and sync them across devices.</p>
        <p>
          <button onClick={() => openAuth('signup')} className="auth-primary" style={{ display: 'inline-block' }}>
            Log in / Sign up
          </button>
        </p>
      </div>
    );
  }

  const avatarUri = user.avatar_url ? `${API_BASE_URL}${user.avatar_url}` : null;

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await updateProfile({
        username: username.trim().replace(/^@/, ''),
        display_name: displayName.trim(),
      });
      setMsg('Profile saved.');
    } catch (e: any) {
      setMsg(e?.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  // Private toggle applies immediately — no Save needed.
  const onTogglePrivate = async (v: boolean) => {
    setIsPrivate(v);
    try {
      await updateProfile({ is_private: v });
    } catch {
      setIsPrivate(!v);
    }
  };

  const onFile = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) {
      alert('Image must be under 10MB.');
      return;
    }
    // Crop to a centered square on a canvas (industry-standard circle crop UX).
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = async () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      canvas.getContext('2d')!.drawImage(
        img,
        (img.width - side) / 2, (img.height - side) / 2, side, side,
        0, 0, 512, 512,
      );
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setAvatarBusy(true);
      try {
        await uploadAvatar(dataUrl);
      } catch (e: any) {
        alert(e?.message ?? 'Upload failed.');
      } finally {
        setAvatarBusy(false);
      }
    };
    img.src = url;
  };

  return (
    <div className="m-card">
      <h2>Profile</h2>
      <div className="profile-row">
        <button
          className="avatar-btn"
          onClick={() => fileRef.current?.click()}
          disabled={avatarBusy}
          aria-label="Change profile photo"
        >
          {avatarUri ? (
            <img src={avatarUri} alt="" className="avatar-img" />
          ) : (
            <span className="avatar-default">👤</span>
          )}
          {avatarBusy && <span className="avatar-busy">…</span>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <div>
          <Link href={`/u/${user.username}`} className="profile-username-link">
            @{user.username}
          </Link>
          <p className="profile-meta">
            Member since {new Date(user.created_at).toLocaleDateString()}
          </p>
          <button className="link-btn" onClick={() => fileRef.current?.click()}>
            Change photo
          </button>
        </div>
      </div>

      <label className="field-label">Username</label>
      <input
        className="auth-input"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="username"
      />
      <label className="field-label">Display name</label>
      <input
        className="auth-input"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Display name"
      />
      <label className="switch-row">
        <span>
          <strong>Private profile</strong>
          <br />
          <small>Only you can see your saved events. Your profile stays visible.</small>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isPrivate}
          aria-label="Private profile"
          className={'switch' + (isPrivate ? ' switch-on' : '')}
          onClick={() => onTogglePrivate(!isPrivate)}
        >
          <span className="switch-knob" />
        </button>
      </label>

      <div className="btn-row">
        <button className="auth-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        <button
          className="auth-secondary"
          onClick={() => {
            if (confirm('Log out of your account?')) logout();
          }}
        >
          Log out
        </button>
      </div>
      {msg && <p className="auth-msg">{msg}</p>}
    </div>
  );
}
