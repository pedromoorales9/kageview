import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../../modules/store';
import {
  deleteAccount,
  errorMessage,
  isUsernameAvailable,
  removeAvatar,
  signOut,
  updatePassword,
  updateProfile,
  uploadAvatar,
} from '../../../modules/account';
import { prepareAvatar } from '../../../modules/imageUtils';
import { useToast } from '../ui/Toast';
import Spinner from '../ui/Spinner';
import Avatar from './Avatar';
import RoleBadge from './RoleBadge';
import { Field, Notice, Switch, ghostButtonClass, primaryButtonClass } from './formKit';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-white font-medium">{title}</p>
        <p className="text-[12.5px] text-muted leading-snug">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

export default function ProfileModal() {
  const open = useAppStore((s) => s.profileModalOpen);
  const { user, profile } = useAppStore((s) => s.account);
  const setOpen = useAppStore((s) => s.setProfileModalOpen);
  const toast = useToast();

  // Datos editables
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [userCheck, setUserCheck] = useState<'idle' | 'invalid' | 'checking' | 'free' | 'taken' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const seq = useRef(0);

  // Foto
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Contraseña
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Borrado
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const [switchBusy, setSwitchBusy] = useState(false);

  // Cargar valores al abrir
  useEffect(() => {
    if (!open || !profile) return;
    setDisplayName(profile.displayName ?? '');
    setUsername(profile.username);
    setBio(profile.bio ?? '');
    setSaveError(null);
    setPhotoError(null);
    setPwOpen(false);
    setPw('');
    setPw2('');
    setPwError(null);
    setDelOpen(false);
    setDelText('');
    setDelError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.id]);

  // Escape cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Disponibilidad del usuario (solo si cambió)
  useEffect(() => {
    if (!open || !profile) return;
    const u = username.trim().toLowerCase();
    if (u === profile.username) return setUserCheck('idle');
    if (!USERNAME_RE.test(u)) return setUserCheck('invalid');
    setUserCheck('checking');
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(u);
        if (mine === seq.current) setUserCheck(free ? 'free' : 'taken');
      } catch {
        if (mine === seq.current) setUserCheck('error');
      }
    }, 450);
    return () => clearTimeout(t);
  }, [username, open, profile]);

  if (!open || !profile) return null;

  const usernameChanged = username.trim().toLowerCase() !== profile.username;
  const dirty =
    usernameChanged ||
    displayName.trim() !== (profile.displayName ?? '') ||
    bio.trim() !== (profile.bio ?? '');
  const canSave =
    dirty && !saving && (!usernameChanged || userCheck === 'free' || userCheck === 'error');

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfile({
        ...(usernameChanged ? { username } : {}),
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
      });
      toast.success('Perfil actualizado.');
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await uploadAvatar(await prepareAvatar(file));
      toast.success('Foto de perfil actualizada.');
    } catch (err) {
      setPhotoError(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const dropPhoto = async () => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await removeAvatar();
    } catch (err) {
      setPhotoError(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const toggle = async (key: 'showActivity' | 'showLibrary', value: boolean) => {
    setSwitchBusy(true);
    try {
      await updateProfile({ [key]: value });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSwitchBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8 || pw !== pw2 || pwBusy) return;
    setPwBusy(true);
    setPwError(null);
    try {
      await updatePassword(pw);
      toast.success('Contraseña actualizada.');
      setPwOpen(false);
      setPw('');
      setPw2('');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  const logout = async () => {
    try {
      await signOut();
      setOpen(false);
      toast.info('Has cerrado sesión.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const removeAccount = async () => {
    if (delText.trim().toLowerCase() !== profile.username || delBusy) return;
    setDelBusy(true);
    setDelError(null);
    try {
      await deleteAccount();
      toast.info('Tu cuenta y tus datos se han eliminado.');
    } catch (err) {
      setDelError(errorMessage(err));
      setDelBusy(false);
    }
  };

  const userHint =
    userCheck === 'checking'
      ? 'Comprobando…'
      : userCheck === 'free'
      ? <span className="text-emerald-300">¡Disponible!</span>
      : userCheck === 'invalid'
      ? '3–20 caracteres: minúsculas, números o _'
      : 'Tus amigos te encuentran con este nombre.';

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-6 bg-[#09050a]/80 animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mi perfil"
        className="relative w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-[28px] bg-[#130a11] hairline shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] animate-fade-in-scale"
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined text-[19px]">close</span>
        </button>

        {/* Cabecera */}
        <div className="relative px-8 pt-8 pb-6 flex items-center gap-5 border-b-[0.5px] border-white/[0.08]">
          <div className="pointer-events-none absolute -top-24 -left-16 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(255,61,90,0.16),transparent_68%)]" />
          <div className="relative flex-none">
            <Avatar profile={profile} size={88} className="ring-2 ring-primary/40" />
            {photoBusy && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <Spinner size={26} />
              </div>
            )}
          </div>
          <div className="relative min-w-0 flex-1">
            <h2 className="font-headline text-[22px] font-bold text-white tracking-[-0.025em] truncate">
              {profile.displayName || profile.username}
            </h2>
            <p className="text-[13.5px] text-secondary truncate flex items-center gap-2">
              @{profile.username} <RoleBadge role={profile.role} />
            </p>
            <p className="text-[12.5px] text-muted truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-3">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickPhoto} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                className="h-8 px-3.5 rounded-full text-[12.5px] font-medium text-white bg-white/[0.1] hover:bg-white/[0.18] transition-colors disabled:opacity-50"
              >
                Cambiar foto
              </button>
              {profile.avatarUrl && (
                <button
                  onClick={dropPhoto}
                  disabled={photoBusy}
                  className="h-8 px-3.5 rounded-full text-[12.5px] font-medium text-on-surface-variant hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>
        {photoError && <div className="px-8 pt-4"><Notice kind="error">{photoError}</Notice></div>}

        <div className="px-8 py-6 flex flex-col gap-8">
          {/* Datos */}
          <Section title="Perfil">
            <Field label="Nombre para mostrar" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40} placeholder={profile.username} />
            <Field label="Nombre de usuario" value={username} maxLength={20}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              error={userCheck === 'taken' ? 'Ese nombre de usuario ya está en uso.' : null} hint={userHint} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-bio" className="text-[12.5px] font-medium text-on-surface-variant">Bio</label>
              <textarea
                id="profile-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="Cuéntales a tus amigos qué te gusta ver…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.06] text-white text-[14.5px] leading-snug resize-none shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] placeholder:text-muted outline-none focus:bg-white/[0.09] focus:shadow-[inset_0_0_0_1.5px_rgba(255,61,90,0.7),0_0_0_4px_rgba(255,61,90,0.14)] transition-all duration-200"
              />
              <p className="text-[12px] text-muted text-right tabular-nums">{bio.length}/200</p>
            </div>
            {saveError && <Notice kind="error">{saveError}</Notice>}
            <div className="flex justify-end">
              <button onClick={save} disabled={!canSave} className={primaryButtonClass}>
                {saving ? <Spinner size={18} /> : 'Guardar cambios'}
              </button>
            </div>
          </Section>

          {/* Privacidad */}
          <Section title="Privacidad">
            <p className="text-[12.5px] text-muted -mt-2 leading-snug">
              Solo tus amigos aceptados pueden ver esto. Nadie más ve tu actividad ni tu lista.
            </p>
            <SwitchRow title="Mostrar lo que estoy viendo" description="Tus amigos verán el anime y episodio que estás viendo, o el manga y capítulo que estás leyendo."
              checked={profile.showActivity} onChange={(v) => toggle('showActivity', v)} disabled={switchBusy} />
            <SwitchRow title="Mostrar mi lista" description="Tus amigos podrán ver tus listas de anime y tu biblioteca de manga (viendo, completados…)."
              checked={profile.showLibrary} onChange={(v) => toggle('showLibrary', v)} disabled={switchBusy} />
          </Section>

          {/* Seguridad */}
          <Section title="Seguridad">
            {!pwOpen ? (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setPwOpen(true)} className={ghostButtonClass}>Cambiar contraseña</button>
                <button onClick={logout} className={ghostButtonClass}>
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <form onSubmit={changePassword} className="flex flex-col gap-4">
                <Field label="Nueva contraseña" type="password" autoComplete="new-password" value={pw}
                  onChange={(e) => setPw(e.target.value)} placeholder="Mínimo 8 caracteres" autoFocus />
                <Field label="Repite la contraseña" type="password" autoComplete="new-password" value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  error={pw2.length > 0 && pw2 !== pw ? 'Las contraseñas no coinciden.' : null} />
                {pwError && <Notice kind="error">{pwError}</Notice>}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setPwOpen(false)} className={ghostButtonClass}>Cancelar</button>
                  <button type="submit" disabled={pw.length < 8 || pw !== pw2 || pwBusy} className={primaryButtonClass}>
                    {pwBusy ? <Spinner size={18} /> : 'Guardar'}
                  </button>
                </div>
              </form>
            )}
          </Section>

          {/* Zona de peligro */}
          <Section title="Zona de peligro">
            {!delOpen ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-[12.5px] text-muted leading-snug">
                  Elimina tu cuenta y todos tus datos (lista, amigos, actividad). No se puede deshacer.
                </p>
                <button onClick={() => setDelOpen(true)}
                  className="flex-none h-10 px-4 rounded-full text-[13px] font-medium text-error bg-error/10 hover:bg-error/20 transition-colors">
                  Eliminar cuenta
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-2xl bg-error/[0.07] ring-1 ring-error/30 p-4">
                <p className="text-[13px] text-on-surface-variant leading-snug">
                  Para confirmar, escribe tu nombre de usuario: <b className="text-white">{profile.username}</b>
                </p>
                <Field label="Nombre de usuario" value={delText} onChange={(e) => setDelText(e.target.value)} autoFocus />
                {delError && <Notice kind="error">{delError}</Notice>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setDelOpen(false); setDelText(''); }} className={ghostButtonClass}>Cancelar</button>
                  <button
                    onClick={removeAccount}
                    disabled={delText.trim().toLowerCase() !== profile.username || delBusy}
                    className="h-11 px-5 rounded-full text-[14px] font-semibold text-white bg-error hover:brightness-110 transition disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                  >
                    {delBusy ? <Spinner size={18} /> : 'Eliminar para siempre'}
                  </button>
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
