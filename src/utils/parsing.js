// Parse Asana project name into structured data
export function parseProjectName(name) {
  const result = {
    company: '',
    country: '',
    type: 'Setup',
    plan: 'Starter',
    channels: [],
    totalChannels: 0,
    parseWarnings: []
  };

  const parts = name.split(' - ');
  if (parts.length >= 2) {
    result.company = parts[0].trim();
  } else {
    result.company = name.trim();
    result.parseWarnings.push('No se encontró separador " - "');
  }

  const fullText = name.toUpperCase();

  // Detect country
  const countries = {
    'CHILE': 'Chile', 'COLOMBI': 'Colombia', 'MÉXICO': 'México',
    'MEXICO': 'México', 'PERÚ': 'Perú', 'PERU': 'Perú',
    'ECUADOR': 'Ecuador', 'ARGENTINA': 'Argentina', 'URUGUAY': 'Uruguay',
    'VENEZUELA': 'Venezuela', 'USA': 'USA'
  };

  for (const [key, value] of Object.entries(countries)) {
    if (fullText.includes(key)) {
      result.country = value;
      break;
    }
  }

  if (!result.country) {
    result.parseWarnings.push('País no detectado');
  }

  // Detect type
  if (fullText.includes('UPGRADE')) {
    result.type = 'Upgrade';
  } else if (fullText.includes('REONBOARDING') || fullText.includes('RE-ONBOARDING')) {
    result.type = 'Reonboarding';
  } else {
    result.type = 'Setup';
  }

  // Detect plan
  const plans = [
    { names: ['PLATINUM'], value: 'Platinum' },
    { names: ['ENTERPRISE', 'ENTREPRISE'], value: 'Enterprise' },
    { names: ['ADVANCED'], value: 'Advanced' },
    { names: ['GOLD'], value: 'Gold' },
    { names: ['PRO ', 'PRO(', 'PRO-', 'PRO)'], value: 'Pro' },
    { names: ['STARTER', 'SATARTER'], value: 'Starter' }
  ];
  for (const plan of plans) {
    if (plan.names.some(n => fullText.includes(n))) {
      result.plan = plan.value;
      break;
    }
  }

  // Parse channels
  const channelMatch = name.match(/\(([^)]+)\)/);
  if (channelMatch) {
    result.channels = parseChannels(channelMatch[1]);
    result.totalChannels = result.channels.length;
  } else {
    result.parseWarnings.push('No se encontraron canales (entre paréntesis)');
  }

  return result;
}

function parseChannels(text) {
  const channels = [];
  const items = text.split('/').map(s => s.trim());

  for (const item of items) {
    const match = item.match(/^(\d+)\s*(.+)$/i);
    if (match) {
      const count = parseInt(match[1]);
      let name = normalizeName(match[2].trim().toUpperCase());
      for (let i = 0; i < count; i++) channels.push(name);
    } else {
      channels.push(normalizeName(item.toUpperCase().trim()));
    }
  }
  return channels;
}

function normalizeName(name) {
  const mapping = {
    'MELI': 'MERCADO LIBRE', 'ML': 'MERCADO LIBRE',
    'MERCADO LIBRE': 'MERCADO LIBRE', 'FCOM': 'FALABELLA',
    'TIKTOK': 'TIKTOK SHOP', 'TIENDA NUBE': 'TIENDANUBE',
    'MSHOPS': 'MERCADO SHOPS', 'WOO': 'WOOCOMMERCE'
  };
  for (const [key, value] of Object.entries(mapping)) {
    if (name.includes(key)) return value;
  }
  return name;
}

export function isComplexIntegration(channelName) {
  const complex = ['VTEX', 'MAGENTO', 'WOOCOMMERCE', 'SHOPIFY', 'SLOT', 'API', 'AGREGADOR', 'PRESTASHOP', 'TIENDANUBE'];
  return complex.some(type => channelName.includes(type));
}

// Fórmulas calibradas contra 1.083 proyectos históricos completados (2022-2026).
// Ajuste robusto (Theil-Sen) sobre duraciones reales en días hábiles por segmento.
// Cobertura de la banda optimista-conservador: 54% (vs 15% de las fórmulas originales).
export const DEFAULT_CALIBRATION = {
  segments: {
    upgrade:      { base: 7,  perChannel: 3 },
    reonboarding: { base: 22, perChannel: 4 },
    starter:      { base: 26, perChannel: 5 },
    pro:          { base: 35, perChannel: 8 },
    gold:         { base: 35, perChannel: 8 },
    advanced:     { base: 30, perChannel: 8 },
    enterprise:   { base: 38, perChannel: 8 },
    platinum:     { base: 38, perChannel: 8 }
  },
  complexExtraDays: 5, // solo aplica fuera de Upgrade; en los datos el efecto real es ~0-5d, no 16
  multipliers: { optimista: 0.6, conservador: 1.7 }, // ≈ P25 y P80 empíricos
  sampleSize: 1083,
  source: 'static',
  generatedAt: '2026-07-10'
};

export function calculateEstimation(plan, type, totalChannels, channels, calibration) {
  const cal = calibration && calibration.segments ? calibration : DEFAULT_CALIBRATION;
  let seg;
  if (type === 'Upgrade') seg = cal.segments.upgrade;
  else if (type === 'Reonboarding') seg = cal.segments.reonboarding;
  else seg = cal.segments[(plan || 'Starter').toLowerCase()] || cal.segments.starter;
  if (!seg) seg = DEFAULT_CALIBRATION.segments.starter;

  let baseDays = seg.base + seg.perChannel * totalChannels;

  if (type !== 'Upgrade' && channels.some(c => isComplexIntegration(c))) {
    baseDays += cal.complexExtraDays ?? DEFAULT_CALIBRATION.complexExtraDays;
  }

  const mult = cal.multipliers || DEFAULT_CALIBRATION.multipliers;
  return {
    esperado: Math.round(baseDays),
    optimista: Math.max(1, Math.round(baseDays * mult.optimista)),
    conservador: Math.round(baseDays * mult.conservador)
  };
}

export function addBusinessDays(date, days) {
  let current = new Date(date);
  let added = 0;
  while (added < days) {
    current.setDate(current.getDate() + 1);
    if (current.getDay() !== 0 && current.getDay() !== 6) added++;
  }
  return current;
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getNextMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function generateTasks(parsed, estimate, startDateStr) {
  const tasks = [];
  const startDate = new Date(startDateStr);

  // Cronograma proporcional a la estimación: con las fórmulas calibradas los
  // proyectos son ~2x más cortos, así que los hitos se ubican como fracción de la
  // duración total en vez de offsets fijos (que dejaban el CIERRE antes que los canales).
  const T = Math.max(estimate, 10);
  const day = (frac) => Math.round(T * frac);

  // INICIO (0% - 25%)
  tasks.push({ section: 'INICIO', task: 'PRE KICK OFF', daysFromStart: 0 });
  tasks.push({ section: 'INICIO', task: 'ENVÍO DE FORMULARIO A MERCHANT', daysFromStart: 0 });
  tasks.push({ section: 'INICIO', task: 'SECUENCIA DE INVITACIONES (ADMINISTRATIVO)', daysFromStart: day(0.05) });
  tasks.push({ section: 'INICIO', task: 'KICK OFF DEFINICIÓN FLUJO DE TRABAJO', daysFromStart: day(0.07) });
  tasks.push({ section: 'INICIO', task: 'WORKSHOP DE BIENVENIDA A MULTIVENDE', daysFromStart: day(0.15) });
  tasks.push({ section: 'INICIO', task: 'CREACIÓN CATÁLOGO DESDE CERO', daysFromStart: day(0.25) });

  // WORKSHOP (30% - 45%)
  const workshopEndDay = day(0.45);
  tasks.push({ section: 'WORKSHOP', task: 'WORKSHOP SOBRE LOGÍSTICA Y MENSAJERÍA EN MELI', daysFromStart: day(0.3) });
  tasks.push({ section: 'WORKSHOP', task: 'WORKSHOP SOBRE EL CATÁLOGO Y PUBLICACIONES', daysFromStart: day(0.3) + 1 });

  const uniqueChannels = [...new Set(parsed.channels)];
  const wsStart = day(0.33);
  const wsSpan = Math.max(workshopEndDay - wsStart, 1);
  uniqueChannels.forEach((ch, i) => {
    const offset = uniqueChannels.length > 1 ? Math.round((i * wsSpan) / (uniqueChannels.length - 1)) : 0;
    tasks.push({ section: 'WORKSHOP', task: `WORKSHOP SOBRE ${ch}`, daysFromStart: wsStart + offset });
  });

  // Channel sections (45% - 92%)
  const remainingDays = day(0.92) - workshopEndDay;
  const daysPerChannel = Math.max(3, Math.floor(remainingDays / parsed.totalChannels));

  let channelIndex = 0;
  const channelCounts = {};
  for (const channel of parsed.channels) {
    channelCounts[channel] = (channelCounts[channel] || 0) + 1;
    const sectionName = `${channel} ${channelCounts[channel]}`;
    const channelStart = workshopEndDay + Math.floor(channelIndex * daysPerChannel);

    tasks.push({ section: sectionName, task: 'MAPEO DE CATEGORÍAS', daysFromStart: channelStart });
    tasks.push({ section: sectionName, task: 'MAPEO DE ATRIBUTOS', daysFromStart: channelStart });
    tasks.push({ section: sectionName, task: 'MAPEO DE PRODUCTOS (ACTIVACIÓN/DESACTIVACIÓN)', daysFromStart: channelStart + 1 });
    tasks.push({ section: sectionName, task: 'LISTADO DE PRECIOS Y ÁLBUM DE FOTOS', daysFromStart: channelStart + 1 });
    tasks.push({ section: sectionName, task: 'CAPACITACIÓN DE VENTAS Y LOGÍSTICA', daysFromStart: channelStart + Math.floor(daysPerChannel * 0.3) });
    tasks.push({ section: sectionName, task: 'CONFIGURACIÓN DE BODEGAS Y ACTUALIZACIÓN DE STOCK', daysFromStart: channelStart + Math.floor(daysPerChannel * 0.3) });
    tasks.push({ section: sectionName, task: 'ACTUALIZACIÓN DE ATRIBUTOS PERSONALIZADOS', daysFromStart: channelStart + Math.floor(daysPerChannel * 0.5) });
    tasks.push({ section: sectionName, task: 'ACTIVACIÓN DE PRODUCTOS Y REVISIÓN DE ERRORES', daysFromStart: channelStart + Math.floor(daysPerChannel * 0.6) });
    tasks.push({ section: sectionName, task: 'CORRECCIÓN DE ERRORES DE SINCRONIZACIÓN', daysFromStart: channelStart + Math.floor(daysPerChannel * 0.7) });
    tasks.push({ section: sectionName, task: 'CREACIÓN Y ACTUALIZACIÓN DEL CATÁLOGO', daysFromStart: channelStart + Math.floor(daysPerChannel * 0.85) });
    tasks.push({ section: sectionName, task: 'VERIFICACIÓN DE SINCRONIZACIÓN', daysFromStart: channelStart + daysPerChannel - 1 });

    channelIndex++;
  }

  // CIERRE (nunca antes del final del último canal)
  const lastChannelEnd = workshopEndDay + parsed.totalChannels * daysPerChannel - 1;
  const endDay = Math.max(estimate, lastChannelEnd + 1);
  tasks.push({ section: 'CIERRE', task: 'CAPACITACIÓN SOBRE REPORTES Y NOTIFICACIONES', daysFromStart: endDay - 1 });
  tasks.push({ section: 'CIERRE', task: 'REUNIÓN FINAL DUDAS Y CIERRE PROCESO ONBOARDING', daysFromStart: endDay });
  tasks.push({ section: 'CIERRE', task: 'ENVIAR CORREO DE CIERRE DEL PROCESO DE ONBOARDING', daysFromStart: endDay });

  return tasks.map(t => ({
    section: t.section,
    task: t.task,
    date: formatDate(addBusinessDays(startDate, t.daysFromStart))
  }));
}
