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

export function calculateEstimation(plan, type, totalChannels, channels) {
  let baseDays = 0;

  if (type === 'Upgrade') {
    baseDays = 14 + 3 * totalChannels;
  } else if (type === 'Reonboarding') {
    baseDays = 59 + 5 * totalChannels;
  } else {
    switch (plan) {
      case 'Starter': baseDays = 59 + 5 * totalChannels; break;
      case 'Pro': baseDays = 56 + 12 * totalChannels; break;
      case 'Advanced': baseDays = 48 + 18 * totalChannels; break;
      case 'Enterprise': baseDays = 80 + 10 * totalChannels; break;
      case 'Gold': baseDays = 56 + 12 * totalChannels; break;
      case 'Platinum': baseDays = 65 + 14 * totalChannels; break;
      default: baseDays = 59 + 5 * totalChannels;
    }
  }

  if (channels.some(c => isComplexIntegration(c))) baseDays += 16;

  return {
    esperado: Math.round(baseDays),
    optimista: Math.round(baseDays * 0.85),
    conservador: Math.round(baseDays * 1.35)
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

  // INICIO
  tasks.push({ section: 'INICIO', task: 'PRE KICK OFF', daysFromStart: 0 });
  tasks.push({ section: 'INICIO', task: 'ENVÍO DE FORMULARIO A MERCHANT', daysFromStart: 0 });
  tasks.push({ section: 'INICIO', task: 'SECUENCIA DE INVITACIONES (ADMINISTRATIVO)', daysFromStart: 3 });
  tasks.push({ section: 'INICIO', task: 'KICK OFF DEFINICIÓN FLUJO DE TRABAJO', daysFromStart: 4 });
  tasks.push({ section: 'INICIO', task: 'WORKSHOP DE BIENVENIDA A MULTIVENDE', daysFromStart: 11 });
  tasks.push({ section: 'INICIO', task: 'CREACIÓN CATÁLOGO DESDE CERO', daysFromStart: 18 });

  // WORKSHOP
  const workshopEndDay = 25 + 7 * (parsed.channels.length + 1);
  tasks.push({ section: 'WORKSHOP', task: 'WORKSHOP SOBRE LOGÍSTICA Y MENSAJERÍA EN MELI', daysFromStart: 25 });
  tasks.push({ section: 'WORKSHOP', task: 'WORKSHOP SOBRE EL CATÁLOGO Y PUBLICACIONES', daysFromStart: 26 });

  const uniqueChannels = [...new Set(parsed.channels)];
  uniqueChannels.forEach((ch, i) => {
    tasks.push({ section: 'WORKSHOP', task: `WORKSHOP SOBRE ${ch}`, daysFromStart: 25 + 7 * (i + 2) });
  });

  // Channel sections
  const remainingDays = estimate - workshopEndDay - 3;
  const daysPerChannel = Math.max(5, Math.floor(remainingDays / parsed.totalChannels));

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

  // CIERRE
  tasks.push({ section: 'CIERRE', task: 'CAPACITACIÓN SOBRE REPORTES Y NOTIFICACIONES', daysFromStart: estimate - 1 });
  tasks.push({ section: 'CIERRE', task: 'REUNIÓN FINAL DUDAS Y CIERRE PROCESO ONBOARDING', daysFromStart: estimate });
  tasks.push({ section: 'CIERRE', task: 'ENVIAR CORREO DE CIERRE DEL PROCESO DE ONBOARDING', daysFromStart: estimate });

  return tasks.map(t => ({
    section: t.section,
    task: t.task,
    date: formatDate(addBusinessDays(startDate, t.daysFromStart))
  }));
}
