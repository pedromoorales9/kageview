import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../../modules/store';
import {
  closeAuth,
  errorMessage,
  isUsernameAvailable,
  openAuth,
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from '../../../modules/account';
import { AuthModalMode } from '../../../types/types';
import { useToast } from '../ui/Toast';
import Spinner from '../ui/Spinner';
import { Field, Notice, ghostButtonClass, primaryButtonClass } from './formKit';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const TITLES: Record<AuthModalMode, { title: string; subtitle: string }> = {
  login: { title: 'Inicia sesión', subtitle: 'Guarda tu lista, sigue a tus amigos y mira qué están viendo.' },
  register: { title: 'Crea tu cuenta', subtitle: 'Gratis. Tus listas y tu perfil viajan contigo.' },
  reset: { title: 'Recupera tu contraseña', subtitle: 'Te enviaremos un enlace para elegir una nueva.' },
  recovery: { title: 'Elige una contraseña nueva', subtitle: 'Usa al menos 8 caracteres.' },
};

/** Ojo para mostrar/ocultar la contraseña. */
function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors"
      tabIndex={-1}
    >
      <span className="material-symbols-outlined text-[19px]">{shown ? 'visibility_off' : 'visibility'}</span>
    </button>
  );
}

// ─── Formularios ───────────────────────────────────────────
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_RE.test(email.trim()) && password.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // El cierre del modal lo hace el efecto de AuthModal al detectar la sesión
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Correo electrónico" type="email" autoComplete="email" autoFocus value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
      <Field label="Contraseña" type={show ? 'text' : 'password'} autoComplete="current-password"
        value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tu contraseña"
        right={<EyeToggle shown={show} onToggle={() => setShow((s) => !s)} />} />
      {error && <Notice kind="error">{error}</Notice>}
      <button type="submit" className={`${primaryButtonClass} mt-1`} disabled={!valid || busy}>
        {busy ? <Spinner size={18} /> : 'Entrar'}
      </button>
      <div className="flex items-center justify-between text-[13px]">
        <button type="button" onClick={() => openAuth('reset')} className="text-on-surface-variant hover:text-white transition-colors">
          ¿Olvidaste tu contraseña?
        </button>
        <button type="button" onClick={() => openAuth('register')} className="text-secondary hover:text-white font-medium transition-colors">
          Crear cuenta
        </button>
      </div>
    </form>
  );
}

type UserCheck = 'idle' | 'invalid' | 'checking' | 'free' | 'taken' | 'error';

function RegisterForm() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<UserCheck>('idle');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const seq = useRef(0);

  // Comprobación de disponibilidad con debounce (ignora respuestas obsoletas)
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) return setCheck('idle');
    if (!USERNAME_RE.test(u)) return setCheck('invalid');
    setCheck('checking');
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(u);
        if (mine === seq.current) setCheck(free ? 'free' : 'taken');
      } catch {
        if (mine === seq.current) setCheck('error');
      }
    }, 450);
    return () => clearTimeout(t);
  }, [username]);

  const passwordOk = password.length >= 8;
  const valid = (check === 'free' || check === 'error') && EMAIL_RE.test(email.trim()) && passwordOk;

  const userHint: Record<UserCheck, React.ReactNode> = {
    idle: '3–20 caracteres: minúsculas, números o _',
    invalid: '3–20 caracteres: minúsculas, números o _',
    checking: 'Comprobando…',
    free: <span className="text-emerald-300">¡Disponible!</span>,
    taken: '',
    error: 'No se pudo comprobar ahora; se validará al crear la cuenta.',
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signUp({ email, password, username: username.trim().toLowerCase() });
      if (res.needsEmailConfirmation) {
        setSentTo(email.trim());
        setBusy(false);
      }
      // Sin confirmación por correo, la sesión se abre sola y el modal se cierra
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center shadow-moon">
          <span className="material-symbols-outlined text-primary text-[32px]">mark_email_read</span>
        </div>
        <div>
          <p className="text-white font-semibold text-[16px]">Revisa tu correo</p>
          <p className="text-on-surface-variant text-[13.5px] mt-1.5 leading-relaxed">
            Hemos enviado un enlace de confirmación a <span className="text-white">{sentTo}</span>.
            Ábrelo en este equipo y KageView entrará en tu cuenta automáticamente.
          </p>
        </div>
        <button type="button" onClick={() => openAuth('login')} className={`${ghostButtonClass} w-full`}>
          Ya lo confirmé · Iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Nombre de usuario" autoComplete="username" autoFocus value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="tu_usuario" maxLength={20}
        error={check === 'taken' ? 'Ese nombre de usuario ya está en uso.' : null}
        hint={userHint[check]} />
      <Field label="Correo electrónico" type="email" autoComplete="email" value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
      <Field label="Contraseña" type={show ? 'text' : 'password'} autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres"
        hint={password && !passwordOk ? 'Mínimo 8 caracteres' : undefined}
        right={<EyeToggle shown={show} onToggle={() => setShow((s) => !s)} />} />
      {error && <Notice kind="error">{error}</Notice>}
      <button type="submit" className={`${primaryButtonClass} mt-1`} disabled={!valid || busy}>
        {busy ? <Spinner size={18} /> : 'Crear cuenta'}
      </button>
      <p className="text-center text-[13px] text-on-surface-variant">
        ¿Ya tienes cuenta?{' '}
        <button type="button" onClick={() => openAuth('login')} className="text-secondary hover:text-white font-medium transition-colors">
          Inicia sesión
        </button>
      </p>
    </form>
  );
}

function ResetForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim()) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Notice kind="success">
          Si existe una cuenta con <b>{email.trim()}</b>, recibirás un enlace para cambiar la contraseña.
          Ábrelo en este equipo.
        </Notice>
        <button type="button" onClick={() => openAuth('login')} className={ghostButtonClass}>Volver a iniciar sesión</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Correo electrónico" type="email" autoComplete="email" autoFocus value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
      {error && <Notice kind="error">{error}</Notice>}
      <button type="submit" className={primaryButtonClass} disabled={!EMAIL_RE.test(email.trim()) || busy}>
        {busy ? <Spinner size={18} /> : 'Enviar enlace'}
      </button>
      <button type="button" onClick={() => openAuth('login')} className="text-[13px] text-on-surface-variant hover:text-white transition-colors">
        Volver
      </button>
    </form>
  );
}

function RecoveryForm() {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = password.length >= 8 && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      toast.success('Contraseña actualizada.');
      closeAuth();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Nueva contraseña" type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus
        value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres"
        right={<EyeToggle shown={show} onToggle={() => setShow((s) => !s)} />} />
      <Field label="Repite la contraseña" type={show ? 'text' : 'password'} autoComplete="new-password"
        value={confirm} onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? 'Las contraseñas no coinciden.' : null} />
      {error && <Notice kind="error">{error}</Notice>}
      <button type="submit" className={primaryButtonClass} disabled={!valid || busy}>
        {busy ? <Spinner size={18} /> : 'Guardar contraseña'}
      </button>
    </form>
  );
}

// ─── Modal ─────────────────────────────────────────────────
export default function AuthModal() {
  const modal = useAppStore((s) => s.authModal);
  const status = useAppStore((s) => s.account.status);
  const toast = useToast();
  // Cerrar con Escape
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuth();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  // Al abrirse la sesión desde login/registro: cerrar y saludar
  useEffect(() => {
    if (modal && status === 'signedIn' && (modal.mode === 'login' || modal.mode === 'register')) {
      closeAuth();
      toast.success(modal.mode === 'register' ? '¡Cuenta creada! Bienvenido a KageView.' : 'Sesión iniciada.');
    }
  }, [modal, status, toast]);

  if (!modal) return null;
  const { title, subtitle } = TITLES[modal.mode];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-[#09050a]/80 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeAuth();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[420px] rounded-[28px] bg-[#130a11] hairline shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] p-8 animate-fade-in-scale overflow-hidden"
      >
        {/* Luna decorativa */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(255,61,90,0.22),transparent_68%)]" />

        <button
          onClick={closeAuth}
          aria-label="Cerrar"
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined text-[19px]">close</span>
        </button>

        <div className="relative mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff5570] to-[#c81a3f] flex items-center justify-center shadow-moon mb-4">
            <span className="font-serif text-[26px] leading-none text-[#0a0508]">影</span>
          </div>
          <h2 className="font-headline text-[24px] font-bold text-white tracking-[-0.03em]">{title}</h2>
          <p className="text-[13.5px] text-on-surface-variant mt-1 leading-snug">{modal.reason ?? subtitle}</p>
        </div>

        <div className="relative" key={modal.mode}>
          {modal.mode === 'login' && <LoginForm />}
          {modal.mode === 'register' && <RegisterForm />}
          {modal.mode === 'reset' && <ResetForm />}
          {modal.mode === 'recovery' && <RecoveryForm />}
        </div>
      </div>
    </div>
  );
}
