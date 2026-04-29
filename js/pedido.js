// ============================================
// PEDIDO.JS - Checkout
// ============================================

const PRODUCT_IMAGE_MAP = {
  'Picada Personal': 'assets/picada-surtida.jpg',
  'Picada para 2': 'assets/picada-surtida.jpg',
  'Picada para 4': 'assets/picada-surtida.jpg',
  'Chicharronada': 'assets/chicharron-2.jpg',
  'Bondiola': 'assets/bondiola.jpg',
  'Costillitas': 'assets/costillas-1.jpg',
  'Ceviche de Chicharrón': 'assets/chicharron-cortado.jpg'
};

function resolveImage(item) {
  if (item.imagen_url && item.imagen_url.trim()) return item.imagen_url;
  return PRODUCT_IMAGE_MAP[item.nombre] || 'assets/picada-surtida.jpg';
}

let CONFIG = {};

// ============================================
// CARGAR CONFIG
// ============================================

async function loadConfig() {
  try {
    const { data } = await db.from('configuracion').select('*');
    if (data) {
      data.forEach(c => CONFIG[c.clave] = c.valor);
      // Actualizar dirección del pickup si es diferente
      if (CONFIG.direccion_local) {
        const el = document.getElementById('pickup-address');
        if (el) el.textContent = CONFIG.direccion_local;
      }
    }
  } catch (err) {
    console.warn('Config no cargada:', err);
  }
}

// ============================================
// PASO 1: Renderizar carrito
// ============================================

function renderCart() {
  const items = Cart.get();
  const list = document.getElementById('cart-list');
  const empty = document.getElementById('cart-empty');
  const summary = document.getElementById('cart-summary');

  if (items.length === 0) {
    list.innerHTML = '';
    summary.style.display = 'none';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  summary.style.display = 'block';

  list.innerHTML = items.map(item => `
    <div class="cart-item" data-id="${item.id}">
      <img class="cart-item-img" src="${resolveImage(item)}" alt="${item.nombre}" loading="lazy" />
      <div class="cart-item-info">
        <div class="cart-item-name">${item.nombre}</div>
        <div class="cart-item-desc">${item.descripcion}</div>
        <div class="cart-item-price">${formatPrice(item.precio)} c/u</div>
        <label class="cart-item-extra">
          <input type="checkbox" data-action="extra-guac" data-id="${item.id}" ${item.guacamole_extra ? 'checked' : ''} />
          <span>+ Guacamole extra <strong>($3.000)</strong></span>
        </label>
      </div>
      <div class="cart-item-actions">
        <div class="cart-item-subtotal">${formatPrice((item.precio + (item.guacamole_extra ? 3000 : 0)) * item.cantidad)}</div>
        <div class="qty-controls">
          <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
          <span class="qty-value">${item.cantidad}</span>
          <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
        </div>
        <button class="cart-item-remove" data-action="remove" data-id="${item.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  document.getElementById('cart-total').textContent = formatPrice(Cart.total());
  wireCartActions();
}

function wireCartActions() {
  document.querySelectorAll('#cart-list [data-action]').forEach(btn => {
    if (btn.dataset.action === 'extra-guac') {
      btn.addEventListener('change', () => {
        const id = Number(btn.dataset.id);
        Cart.toggleExtra(id, 'guacamole_extra');
        renderCart();
        updateMiniTotal();
      });
    } else {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;
        if (action === 'inc') Cart.increment(id);
        else if (action === 'dec') Cart.decrement(id);
        else if (action === 'remove') Cart.remove(id);
        renderCart();
        updateMiniTotal();
      });
    }
  });
}

// ============================================
// STEP NAVIGATION
// ============================================

function goToStep(n) {
  // Validar carrito no vacío para avanzar a 2 o 3
  if (n >= 2 && Cart.get().length === 0) {
    showToast('Agrega al menos un producto antes de continuar', 'error');
    n = 1;
  }

  document.querySelectorAll('.step-content').forEach(s => {
    s.hidden = true;
    s.classList.remove('active');
  });
  document.getElementById(`step-${n}`).hidden = false;
  document.getElementById(`step-${n}`).classList.add('active');

  document.querySelectorAll('.step').forEach(s => {
    const step = Number(s.dataset.step);
    s.classList.remove('active', 'done');
    if (step < n) s.classList.add('done');
    else if (step === n) s.classList.add('active');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// STEP 2: Fill fechas y horas
// ============================================

function fillDateOptions() {
  const sel = document.getElementById('c-fecha');
  const sundays = getNextSundays(2);
  sel.innerHTML = sundays.map(d => {
    const iso = formatDateISO(d);
    return `<option value="${iso}">${formatDateLong(d)}</option>`;
  }).join('');
}

function fillTimeOptions() {
  const sel = document.getElementById('c-hora');
  const slots = getTimeSlots();
  sel.innerHTML = slots.map(s => `<option value="${s}">${formatTime12h(s)}</option>`).join('');
}

function updateMiniTotal() {
  const mini = document.getElementById('cart-mini-total');
  if (mini) mini.textContent = formatPrice(Cart.total());
}

// ============================================
// STEP 2: Modalidad (domicilio/recoger)
// ============================================

function wireModalidad() {
  const radios = document.querySelectorAll('input[name="modalidad"]');
  const group = document.getElementById('direccion-group');
  const input = document.getElementById('c-direccion');

  function update() {
    const val = document.querySelector('input[name="modalidad"]:checked').value;
    if (val === 'recoger') {
      group.style.display = 'none';
      input.required = false;
    } else {
      group.style.display = 'block';
      input.required = true;
    }
  }

  radios.forEach(r => r.addEventListener('change', update));
  update();
}

// ============================================
// STEP 2: Submit pedido
// ============================================

function wireCheckoutForm() {
  const form = document.getElementById('checkout-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('submit-order');
    const errorEl = document.getElementById('checkout-error');
    errorEl.classList.remove('visible');

    // Validar carrito
    const items = Cart.get();
    if (items.length === 0) {
      errorEl.textContent = 'Tu carrito está vacío.';
      errorEl.classList.add('visible');
      return;
    }

    // Capturar datos
    const nombre = document.getElementById('c-nombre').value.trim();
    const telefonoRaw = document.getElementById('c-telefono').value.trim();
    const telefono = telefonoRaw.replace(/\D/g, '');
    const modalidad = document.querySelector('input[name="modalidad"]:checked').value;
    const direccion = document.getElementById('c-direccion').value.trim();
    const fecha = document.getElementById('c-fecha').value;
    const hora = document.getElementById('c-hora').value;
    const obs = document.getElementById('c-obs').value.trim();

    // Validaciones
    if (nombre.length < 3) {
      errorEl.textContent = 'Escribe tu nombre completo.';
      errorEl.classList.add('visible');
      return;
    }
    if (telefono.length < 7) {
      errorEl.textContent = 'Escribe un número de WhatsApp válido.';
      errorEl.classList.add('visible');
      return;
    }
    if (modalidad === 'domicilio' && direccion.length < 3) {
      errorEl.textContent = 'Necesitamos tu dirección para el domicilio.';
      errorEl.classList.add('visible');
      return;
    }
    if (!fecha || !hora) {
      errorEl.textContent = 'Selecciona fecha y hora.';
      errorEl.classList.add('visible');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = 'Enviando...';

    const total = Cart.total();
    const itemsPayload = items.map(i => {
      const extraPrice = i.guacamole_extra ? 3000 : 0;
      const unitPrice = i.precio + extraPrice;
      return {
        id: i.id,
        nombre: i.nombre,
        precio: i.precio,
        cantidad: i.cantidad,
        guacamole_extra: !!i.guacamole_extra,
        subtotal: unitPrice * i.cantidad
      };
    });

    try {
      const { data, error } = await db.from('pedidos').insert({
        nombre_cliente: nombre,
        telefono: telefono,
        modalidad: modalidad,
        direccion: modalidad === 'domicilio' ? direccion : null,
        fecha_entrega: fecha,
        hora_entrega: hora,
        observaciones: obs || null,
        items: itemsPayload,
        total: total,
        estado: 'pendiente'
      }).select().single();

      if (error) throw error;

      // Guardar datos del pedido para mostrar banner en el index
      sessionStorage.setItem('albarril_order_success', JSON.stringify({
        nombre,
        telefono,
        total,
        pedido_id: data?.id
      }));
      Cart.clear();
      // Redirigir al menú principal
      window.location.href = 'index.html';
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.innerHTML = 'Realizar pedido <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
      errorEl.textContent = 'No pudimos enviar tu pedido. Revisa tu conexión e intenta de nuevo.';
      errorEl.classList.add('visible');
    }
  });
}

// ============================================
// STEP 3: Mostrar confirmación
// ============================================

function showConfirmation(data) {
  // Mostrar número para verificación
  const phoneDisplay = '+57 ' + data.telefono.replace(/^57/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  document.getElementById('confirm-phone').textContent = phoneDisplay;

  // Resumen
  const fechaDate = new Date(data.fecha + 'T00:00:00');
  let html = `<div class="confirm-resumen-title">Resumen de tu pedido</div>`;
  data.items.forEach(i => {
    html += `<div class="confirm-resumen-line">
      <span>${i.cantidad}× ${i.nombre}</span>
      <span>${formatPrice(i.subtotal)}</span>
    </div>`;
  });
  html += `<div class="confirm-resumen-line total">
    <span>Total</span>
    <span>${formatPrice(data.total)}</span>
  </div>`;
  html += `<div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--smoke); font-size: 0.82rem;">
    <div><strong style="color:var(--gold);">Entrega:</strong> ${formatDateLong(fechaDate)} · ${formatTime12h(data.hora)}</div>
    <div><strong style="color:var(--gold);">Modalidad:</strong> ${data.modalidad === 'domicilio' ? 'Domicilio a ' + data.direccion : 'Recoger en ' + (CONFIG.direccion_local || 'el local')}</div>
  </div>`;

  document.getElementById('confirm-resumen').innerHTML = html;
}

// ============================================
// TOAST
// ============================================

let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.toggle('error', type === 'error');
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  renderCart();
  fillDateOptions();
  fillTimeOptions();
  wireModalidad();
  wireCheckoutForm();
  updateMiniTotal();

  document.getElementById('go-step-2').addEventListener('click', () => {
    goToStep(2);
    updateMiniTotal();
  });
  document.getElementById('go-step-1').addEventListener('click', () => goToStep(1));
});
