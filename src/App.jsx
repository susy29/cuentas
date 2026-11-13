import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

const CATS = {
  ingreso: ['Ventas', 'Sueldo', 'Cobros', 'Otros ingresos'],
  egreso: ['Comida', 'Renta', 'Servicios', 'Transporte', 'Proveedores', 'Salud', 'Otros gastos'],
}
const CUENTAS = ['Efectivo', 'Banco', 'Tarjeta']
const MAX_MB = 5

const mx = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const p2 = (n) => String(n).padStart(2, '0')
const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
const sumaMes = (ym, n) => {
  const [y, m] = ym.split('-')
  const d = new Date(+y, +m - 1 + n, 1)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
}
const nombreMes = (ym) => {
  const [y, m] = ym.split('-')
  const s = new Date(+y, +m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return s[0].toUpperCase() + s.slice(1)
}
const traduce = (msg = '') => {
  if (/invalid login/i.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/already registered/i.test(msg)) return 'Ese correo ya tiene una cuenta. Inicia sesión.'
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/email not confirmed/i.test(msg)) return 'Confirma tu correo desde el enlace que te enviamos.'
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  return msg
}

export default function App() {
  if (!supabase) return <Aviso />
  return <Raiz />
}

function Aviso() {
  return (
    <div className="centro">
      <div className="tarjeta">
        <h1>Falta conectar Supabase</h1>
        <p className="mut">
          Copia <code>.env.example</code> a <code>.env</code>, pega la URL y la anon key de tu proyecto y reinicia el
          servidor.
        </p>
      </div>
    </div>
  )
}

function Raiz() {
  const [sesion, setSesion] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (sesion === undefined) return <div className="centro mut">Cargando…</div>
  return sesion ? <Panel user={sesion.user} /> : <Acceso />
}

function Acceso() {
  const [modo, setModo] = useState('entrar')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } =
      modo === 'entrar'
        ? await supabase.auth.signInWithPassword({ email, password: pass })
        : await supabase.auth.signUp({ email, password: pass })
    setBusy(false)
    if (error) return setMsg({ ok: false, t: traduce(error.message) })
    if (modo === 'crear' && !data.session)
      setMsg({ ok: true, t: 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.' })
  }

  return (
    <div className="centro">
      <form className="tarjeta" onSubmit={enviar}>
        <h1>Mis cuentas</h1>
        <p className="mut">{modo === 'entrar' ? 'Inicia sesión para ver tus movimientos.' : 'Crea tu cuenta para empezar.'}</p>
        <label>
          Correo
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            required
            minLength={6}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>
        {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.t}</p>}
        <button className="go" disabled={busy}>{busy ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
        <button type="button" className="link" onClick={() => { setModo(modo === 'entrar' ? 'crear' : 'entrar'); setMsg(null) }}>
          {modo === 'entrar' ? 'No tengo cuenta, crear una' : 'Ya tengo cuenta, entrar'}
        </button>
      </form>
    </div>
  )
}

function Panel({ user }) {
  const [ym, setYm] = useState(hoy().slice(0, 7))
  const [movs, setMovs] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null) // null | 'nuevo' | movimiento
  const [v, setV] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    supabase
      .from('movimientos')
      .select('*')
      .gte('fecha', `${ym}-01`)
      .lt('fecha', `${sumaMes(ym, 1)}-01`)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!vivo) return
        setMovs(data ?? [])
        setError(error ? 'No se pudieron cargar los movimientos.' : null)
        setCargando(false)
      })
    return () => { vivo = false }
  }, [ym, v])

  const tot = useMemo(() => {
    let i = 0, e = 0
    const cat = {}, cta = {}
    for (const m of movs) {
      const a = Number(m.monto)
      if (m.tipo === 'ingreso') i += a
      else { e += a; cat[m.categoria] = (cat[m.categoria] || 0) + a }
      cta[m.cuenta] = (cta[m.cuenta] || 0) + (m.tipo === 'ingreso' ? a : -a)
    }
    return { i, e, cat: Object.entries(cat).sort((a, b) => b[1] - a[1]), cta: Object.entries(cta) }
  }, [movs])

  const lista = movs.filter((m) => {
    if (filtro !== 'todos' && m.tipo !== filtro) return false
    const t = q.trim().toLowerCase()
    return !t || [m.concepto, m.categoria, m.notas, m.cuenta].some((x) => (x || '').toLowerCase().includes(t))
  })
  const suma = tot.i + tot.e

  function exportar() {
    const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`
    const filas = [['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Cuenta', 'Monto', 'Notas', 'Recibo']]
    for (const m of [...movs].reverse())
      filas.push([m.fecha, m.tipo === 'ingreso' ? 'Recibí' : 'Pagué', m.concepto, m.categoria, m.cuenta, m.monto, m.notas, m.recibo_nombre])
    const blob = new Blob(['\ufeff' + filas.map((f) => f.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cuentas-${ym}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <header className="hd">
        <div className="wrap">
          <div className="bar">
            <h1>Mis cuentas</h1>
            <div className="mes">
              <button onClick={() => setYm(sumaMes(ym, -1))} aria-label="Mes anterior">‹</button>
              <span>{nombreMes(ym)}</span>
              <button onClick={() => setYm(sumaMes(ym, 1))} aria-label="Mes siguiente">›</button>
            </div>
          </div>
          <div className="sal">
            <div className="t"><small>Saldo del mes</small><b>{mx(tot.i - tot.e)}</b></div>
            <div className="dos">
              <div><small>Recibí</small><b className="vi">{mx(tot.i)}</b></div>
              <div><small>Pagué</small><b className="ve">{mx(tot.e)}</b></div>
            </div>
          </div>
          <div className="sp">
            <i style={{ width: suma ? `${(tot.i / suma) * 100}%` : 0, background: 'var(--hin)' }} />
            <i style={{ width: suma ? `${(tot.e / suma) * 100}%` : 0, background: 'var(--hout)' }} />
          </div>
          <div className="user">
            <span>{user.email}</span>
            <button className="link" onClick={() => supabase.auth.signOut()}>Salir</button>
          </div>
        </div>
      </header>

      <div className="wrap grid">
        <section className="stmt" aria-label="Movimientos">
          <div className="tabs">
            {[['todos', 'Todos'], ['ingreso', 'Recibí'], ['egreso', 'Pagué']].map(([k, t]) => (
              <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t}</button>
            ))}
            <input className="buscar" type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar movimientos" />
          </div>
          {error && <p className="err pad">{error}</p>}
          {cargando ? (
            <div className="vac">Cargando…</div>
          ) : !lista.length ? (
            <div className="vac">{movs.length ? 'Nada coincide con tu búsqueda.' : 'Aún no hay movimientos en este mes.'}</div>
          ) : (
            lista.map((m) => (
              <button key={m.id} className="r" onClick={() => setSel(m)}>
                <span className="f">{m.fecha.slice(8)}/{m.fecha.slice(5, 7)}</span>
                <span className="c">
                  <b>{m.concepto}</b>
                  <small>{m.categoria}, {m.cuenta}{m.recibo_path ? ', con recibo' : ''}</small>
                </span>
                <span className={`m ${m.tipo === 'ingreso' ? 'i' : 'e'}`}>{m.tipo === 'ingreso' ? '+' : '−'} {mx(m.monto)}</span>
                <span className="clip" aria-hidden="true">{m.recibo_path ? '📎' : ''}</span>
              </button>
            ))
          )}
        </section>

        <aside className="side">
          <button className="go desk" onClick={() => setSel('nuevo')}>Nuevo movimiento</button>
          <div className="card">
            <h2>En qué se va el dinero</h2>
            {tot.cat.length ? tot.cat.map(([k, a]) => (
              <div className="cat" key={k}>
                <div><span>{k}</span><span>{mx(a)}</span></div>
                <i style={{ width: `${(a / tot.e) * 100}%` }} />
              </div>
            )) : <p className="mut">Sin pagos este mes.</p>}
          </div>
          <div className="card">
            <h2>Por cuenta</h2>
            {tot.cta.length ? tot.cta.map(([k, a]) => (
              <div className="cta" key={k}><span>{k}</span><b className={a < 0 ? 've2' : ''}>{mx(a)}</b></div>
            )) : <p className="mut">Sin movimientos este mes.</p>}
          </div>
          <button className="ghost" onClick={exportar} disabled={!movs.length}>Descargar el mes en CSV</button>
        </aside>
      </div>

      <button className="fab" onClick={() => setSel('nuevo')}>Nuevo movimiento</button>

      {sel && (
        <Formulario
          key={sel === 'nuevo' ? 'nuevo' : sel.id}
          mov={sel === 'nuevo' ? null : sel}
          userId={user.id}
          onClose={() => setSel(null)}
          onSaved={(mes) => { setSel(null); if (mes) setYm(mes); setV((x) => x + 1) }}
        />
      )}
    </>
  )
}

function Formulario({ mov, userId, onClose, onSaved }) {
  const nuevo = !mov
  const [tipo, setTipo] = useState(mov?.tipo ?? 'ingreso')
  const [monto, setMonto] = useState(mov ? String(mov.monto) : '')
  const [fecha, setFecha] = useState(mov?.fecha ?? hoy())
  const [concepto, setConcepto] = useState(mov?.concepto ?? '')
  const [categoria, setCategoria] = useState(mov?.categoria ?? CATS.ingreso[0])
  const [cuenta, setCuenta] = useState(mov?.cuenta ?? CUENTAS[0])
  const [notas, setNotas] = useState(mov?.notas ?? '')
  const [archivo, setArchivo] = useState(null)
  const [quitar, setQuitar] = useState(false)
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!mov?.recibo_path) return
    supabase.storage.from('recibos').createSignedUrl(mov.recibo_path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [mov])

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const opciones = CATS[tipo].includes(categoria) ? CATS[tipo] : [categoria, ...CATS[tipo]]

  function cambiaTipo(t) {
    setTipo(t)
    if (!CATS[t].includes(categoria)) setCategoria(CATS[t][0])
  }

  function elegir(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) return setErr('Solo se aceptan imágenes o PDF.')
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`El archivo pesa más de ${MAX_MB} MB.`)
    setErr(null)
    setArchivo(f)
    setQuitar(false)
  }

  async function guardar(e) {
    e.preventDefault()
    setErr(null)
    const m = parseFloat(monto)
    if (!(m > 0)) return setErr('Escribe un monto mayor a cero.')
    setBusy(true)
    const bucket = supabase.storage.from('recibos')
    let path = mov?.recibo_path ?? null
    let nombre = mov?.recibo_nombre ?? null
    let viejo = null
    let subido = null
    if (archivo) {
      subido = `${userId}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.-]+/g, '_')}`
      const { error } = await bucket.upload(subido, archivo, { contentType: archivo.type })
      if (error) { setBusy(false); return setErr('No se pudo subir el recibo: ' + error.message) }
      viejo = path
      path = subido
      nombre = archivo.name
    } else if (quitar && path) {
      viejo = path
      path = null
      nombre = null
    }
    const fila = { tipo, monto: m, fecha, concepto: concepto.trim(), categoria, cuenta, notas: notas.trim() || null, recibo_path: path, recibo_nombre: nombre }
    const { error } = nuevo
      ? await supabase.from('movimientos').insert(fila)
      : await supabase.from('movimientos').update(fila).eq('id', mov.id)
    if (error) {
      if (subido) await bucket.remove([subido])
      setBusy(false)
      return setErr('No se pudo guardar: ' + error.message)
    }
    if (viejo) await bucket.remove([viejo])
    onSaved(fecha.slice(0, 7))
  }

  async function borrar() {
    if (!confirm('¿Borrar este movimiento y su recibo?')) return
    setBusy(true)
    const { error } = await supabase.from('movimientos').delete().eq('id', mov.id)
    if (error) { setBusy(false); return setErr('No se pudo borrar: ' + error.message) }
    if (mov.recibo_path) await supabase.storage.from('recibos').remove([mov.recibo_path])
    onSaved(null)
  }

  const esPdf = /\.pdf$/i.test(mov?.recibo_nombre || '')
  const hayRecibo = mov?.recibo_path && !quitar && !archivo

  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={nuevo ? 'Nuevo movimiento' : 'Editar movimiento'} onSubmit={guardar}>
        <div className="mh">
          <h2>{nuevo ? 'Nuevo movimiento' : 'Editar movimiento'}</h2>
          <button type="button" className="link" onClick={onClose}>Cerrar</button>
        </div>
        <div className="seg" role="group" aria-label="Tipo">
          <button type="button" className="i" aria-pressed={tipo === 'ingreso'} onClick={() => cambiaTipo('ingreso')}>Recibí</button>
          <button type="button" className="e" aria-pressed={tipo === 'egreso'} onClick={() => cambiaTipo('egreso')}>Pagué</button>
        </div>
        <label>
          Monto
          <span className="pre"><span>$</span><input type="number" step="0.01" min="0" inputMode="decimal" required placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus /></span>
        </label>
        <label>
          Concepto
          <input type="text" required maxLength={80} placeholder="Ej. Pago de cliente, renta, luz" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        </label>
        <div className="g3">
          <label>Categoría<select value={categoria} onChange={(e) => setCategoria(e.target.value)}>{opciones.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Cuenta<select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>{CUENTAS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Fecha<input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        </div>
        <label>
          Notas (opcional)
          <textarea rows={2} maxLength={300} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>

        <div className="rec">
          <b>Recibo</b>
          {hayRecibo && (
            <div className="prev">
              {url ? (esPdf ? <a href={url} target="_blank" rel="noreferrer">Abrir {mov.recibo_nombre}</a> : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Recibo" /></a>) : <span className="mut">Cargando recibo…</span>}
              <button type="button" className="link" onClick={() => setQuitar(true)}>Quitar recibo</button>
            </div>
          )}
          {archivo && <p className="mut">Se subirá: {archivo.name}</p>}
          {quitar && !archivo && <p className="mut">El recibo se quitará al guardar.</p>}
          <label className="sube">
            {hayRecibo || archivo ? 'Cambiar archivo' : 'Subir foto o PDF'}
            <input type="file" accept="image/*,application/pdf" onChange={elegir} />
          </label>
          <small className="mut">Imagen o PDF, hasta {MAX_MB} MB.</small>
        </div>

        {err && <p className="err">{err}</p>}
        <div className="acc">
          {!nuevo && <button type="button" className="del" onClick={borrar} disabled={busy}>Borrar</button>}
          <button className="go" disabled={busy}>{busy ? 'Guardando…' : 'Guardar movimiento'}</button>
        </div>
      </form>
    </div>
  )
}
