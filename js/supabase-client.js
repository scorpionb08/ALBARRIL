// ============================================
// SUPABASE CLIENT - AL BARRIL
// ============================================

const SUPABASE_URL = 'https://ihveslrseeykhtrsatnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodmVzbHJzZWV5a2h0cnNhdG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NTczNTMsImV4cCI6MjA5MjIzMzM1M30.qiLdD0LAH1AVtuMWmX6CyBYPrDGZ9bE5LHFkmf8Pp-g';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// CARRITO (POR SESIÓN - FIX)
// ============================================

// Generar ID único por cliente (solo por sesión)
function getSessionId() {
  let id = sessionStorage.getItem('albarril_session');
  if (!id) {
    id = 'sess_' + Math.random().toString(36).substring(2, 12);
    sessionStorage.setItem('albarril_session', id);
  }
  return id;
}

const Cart = {
  key() {
    return 'albarril_cart_' + getSessionId();
  },

  get() {
    try {
      return JSON.parse(localStorage.getItem(this.key()) || '[]');
    } catch {
      return [];
    }
  },

  save(items) {
    localStorage.setItem(this.key(), JSON.stringify(items));
    this.updateBadge();
  },

  add(product) {
    const items = this.get();
    const existing = items.find(i => i.id === product.id);

    if (existing) {
      existing.cantidad += 1;
    } else {
      items.push({
        id: product.id,
        nombre: product.nombre,
        descripcion: product.descripcion,
        precio: product.precio,
        imagen_url: product.imagen_url,
        cantidad: 1
      });
    }

    this.save(items);
  },

  increment(id) {
    const items = this.get();
    const item = items.find(i => i.id === id);
    if (item) item.cantidad += 1;
    this.save(items);
  },

  decrement(id) {
    const items = this.get();
    const item = items.find(i => i.id === id);

    if (item) {
      item.cantidad -= 1;
      if (item.cantidad <= 0) {
        return this.save(items.filter(i => i.id !== id));
      }
    }

    this.save(items);
  },

  remove(id) {
    this.save(this.get().filter(i => i.id !== id));
  },

  toggleExtra(id, extraName) {
    const items = this.get();
    const item = items.find(i => i.id === id);
    if (item) {
      item[extraName] = !item[extraName];
    }
    this.save(items);
  },

  clear() {
    this.save([]);
  },

  count() {
    return this.get().reduce((sum, i) => sum + i.cantidad, 0);
  },

  total() {
    return this.get().reduce((sum, i) => {
      const extra = i.guacamole_extra ? 3000 : 0;
      return sum + ((i.precio + extra) * i.cantidad);
    }, 0);
  },

  getQuantity(id) {
    const item = this.get().find(i => i.id === id);
    return item ? item.cantidad : 0;
  },

  hasExtra(id, extraName) {
    const item = this.get().find(i => i.id === id);
    return item ? !!item[extraName] : false;
  },

  updateBadge() {
    const badge = document.getElementById('cart-badge');
    const fab = document.getElementById('cart-fab');
    if (!badge || !fab) return;

    const count = this.count();

    if (count > 0) {
      badge.textContent = count;
      fab.classList.add('visible');
    } else {
      fab.classList.remove('visible');
    }
  }
};


// ============================================
// AUTH ADMIN (simple, client-side)
// ============================================

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const Auth = {
  async login(usuario, password) {
    const passwordHash = await sha256(password);
    const { data, error } = await db
      .from('admins')
      .select('*')
      .eq('usuario', usuario)
      .eq('password_hash', passwordHash)
      .maybeSingle();
    if (error || !data) return false;
    sessionStorage.setItem('albarril_admin', JSON.stringify({ usuario: data.usuario, ts: Date.now() }));
    return true;
  },
  isLoggedIn() {
    const session = sessionStorage.getItem('albarril_admin');
    if (!session) return false;
    try {
      const { ts } = JSON.parse(session);
      // Sesión válida por 8 horas
      if (Date.now() - ts > 8 * 60 * 60 * 1000) {
        sessionStorage.removeItem('albarril_admin');
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },
  logout() {
    sessionStorage.removeItem('albarril_admin');
  }
};

// ============================================
// UTILS
// ============================================

function formatPrice(price) {
  return '$' + Math.round(price).toLocaleString('es-CO');
}

function getNextSundays(count = 2) {
  const sundays = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let current = new Date(today);
  // Ir al próximo domingo (día 0). Si hoy es domingo, cuenta hoy como el próximo.
  const daysUntilSunday = (7 - current.getDay()) % 7;
  current.setDate(current.getDate() + (daysUntilSunday === 0 ? 0 : daysUntilSunday));
  // Si hoy es domingo y ya pasó la hora límite (5pm), saltar al siguiente
  if (daysUntilSunday === 0 && new Date().getHours() >= 17) {
    current.setDate(current.getDate() + 7);
  }
  for (let i = 0; i < count; i++) {
    sundays.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }
  return sundays;
}

function formatDateLong(date) {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return `${dias[date.getDay()]} ${date.getDate()} de ${meses[date.getMonth()]}`;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTimeSlots() {
  // 12:30 a 17:00 cada 30 min
  const slots = [];
  let h = 12, m = 30;
  while (h < 17 || (h === 17 && m === 0)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += 30;
    if (m >= 60) { m = 0; h += 1; }
  }
  return slots;
}

function formatTime12h(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
