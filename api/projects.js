// Vercel Serverless Function: Fetch onboarding projects from Asana in real-time
const ASANA_BASE = 'https://app.asana.com/api/1.0';

// Portfolio GIDs for the 3 onboarding types
const PORTFOLIOS = {
  setup: '1203602528347966',
  upgrade: '1203602528347970',
  reonboarding: '1203602528347974',
};

const OPT_FIELDS = [
  'name', 'owner', 'owner.name',
  'current_status_update', 'current_status_update.status_type',
  'start_on', 'due_on', 'created_at', 'completed', 'completed_at',
  'custom_fields', 'custom_fields.name', 'custom_fields.display_value',
  'permalink_url',
].join(',');

async function fetchAllPortfolioItems(portfolioGid, token) {
  let allItems = [];
  let offset = null;

  do {
    const url = new URL(`${ASANA_BASE}/portfolios/${portfolioGid}/items`);
    url.searchParams.set('opt_fields', OPT_FIELDS);
    url.searchParams.set('limit', '100');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Asana API error ${res.status}: ${err}`);
    }

    const json = await res.json();
    allItems = allItems.concat(json.data || []);
    offset = json.next_page?.offset || null;
  } while (offset);

  return allItems;
}

function parseProjectName(name) {
  const result = {
    company: '', country: '', type: 'Setup', plan: 'Starter',
    channels: [], totalChannels: 0,
  };

  const parts = name.split(' - ');
  result.company = parts.length >= 2 ? parts[0].trim() : name.trim();

  const fullText = name.toUpperCase();

  // Country detection
  const countries = {
    'CHILE': 'Chile', 'COLOMBI': 'Colombia', 'MÉXICO': 'México',
    'MEXICO': 'México', 'PERÚ': 'Perú', 'PERU': 'Perú',
    'ECUADOR': 'Ecuador', 'ARGENTINA': 'Argentina', 'URUGUAY': 'Uruguay',
    'USA': 'USA', 'BRASIL': 'Brasil',
  };
  for (const [key, value] of Object.entries(countries)) {
    if (fullText.includes(key)) { result.country = value; break; }
  }

  // Type detection
  if (fullText.includes('UPGRADE')) result.type = 'Upgrade';
  else if (fullText.includes('REONBOARDING') || fullText.includes('RE-ONBOARDING') || fullText.includes('RENEWAL')) result.type = 'Reonboarding';
  else result.type = 'Setup';

  // Plan detection
  const plans = [
    { names: ['PLATINUM'], value: 'Platinum' },
    { names: ['ENTERPRISE', 'ENTREPRISE'], value: 'Enterprise' },
    { names: ['ADVANCED'], value: 'Advanced' },
    { names: ['GOLD'], value: 'Gold' },
    { names: ['PRO ', 'PRO(', 'PRO-', 'PRO)'], value: 'Pro' },
    { names: ['STARTER', 'SATARTER'], value: 'Starter' },
  ];
  for (const plan of plans) {
    if (plan.names.some(n => fullText.includes(n))) { result.plan = plan.value; break; }
  }

  // Channel parsing
  const channelMatch = name.match(/\(([^)]+)\)/);
  if (channelMatch) {
    result.channels = parseChannels(channelMatch[1]);
    result.totalChannels = result.channels.length;
  }

  return result;
}

function parseChannels(text) {
  const mapping = {
    'MELI': 'Mercado Libre', 'ML': 'Mercado Libre', 'MERCADO LIBRE': 'Mercado Libre',
    'FCOM': 'Falabella', 'FALABELLA': 'Falabella',
    'TIKTOK': 'TikTok Shop', 'TIENDA NUBE': 'Tiendanube',
    'MSHOPS': 'Mercado Shops', 'WOO': 'WooCommerce',
    'AMAZON': 'Amazon', 'SHOPIFY': 'Shopify', 'VTEX': 'Vtex',
    'WALMART': 'Walmart', 'LIVERPOOL': 'Liverpool', 'COPPEL': 'Coppel',
    'RIPLEY': 'Ripley', 'PARIS': 'Paris', 'HITES': 'Hites',
    'DAFITI': 'Dafiti', 'PRESTASHOP': 'PrestaShop',
    'MAGENTO': 'Magento', 'WOOCOMMERCE': 'WooCommerce',
  };

  const channels = [];
  const items = text.split('/').map(s => s.trim());

  for (const item of items) {
    const match = item.match(/^(\d+)\s*(.+)$/i);
    const rawName = match ? match[2].trim().toUpperCase() : item.toUpperCase().trim();
    const count = match ? parseInt(match[1]) : 1;

    let normalized = rawName;
    for (const [key, value] of Object.entries(mapping)) {
      if (rawName.includes(key)) { normalized = value; break; }
    }
    if (normalized === rawName) normalized = item.trim(); // keep original casing if no match

    for (let i = 0; i < count; i++) channels.push(normalized);
  }
  return channels;
}

function getCustomFieldValue(project, fieldName) {
  const field = project.custom_fields?.find(f => f.name === fieldName);
  return field?.display_value || null;
}

function mapStatusType(statusType) {
  const mapping = {
    'on_track': 'En Progreso',
    'at_risk': 'En Riesgo',
    'off_track': 'Atrasado',
    'on_hold': 'En Pausa',
    'complete': 'Completado',
  };
  return mapping[statusType] || 'Sin estado';
}

function calculateDays(project) {
  const start = project.start_on || project.created_at?.split('T')[0];
  if (!start) return null;

  const startDate = new Date(start);
  const endDate = project.completed_at
    ? new Date(project.completed_at)
    : new Date();

  const diffMs = endDate - startDate;
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function transformProject(project) {
  const parsed = parseProjectName(project.name);
  const estadoOnb = getCustomFieldValue(project, 'Estado onboarding');
  const planField = getCustomFieldValue(project, 'Plan');
  const paisField = getCustomFieldValue(project, 'País');
  const statusType = project.current_status_update?.status_type;

  return {
    gid: project.gid,
    name: project.name,
    company: parsed.company,
    type: parsed.type,
    plan: planField || parsed.plan,
    country: paisField || parsed.country,
    owner: project.owner?.name || 'Sin asignar',
    start: project.start_on || null,
    end: project.due_on || null,
    createdAt: project.created_at,
    completed: project.completed || false,
    completedAt: project.completed_at || null,
    days: calculateDays(project),
    channels: parsed.channels,
    totalChannels: parsed.totalChannels,
    status: estadoOnb || mapStatusType(statusType),
    statusType: statusType || null,
    permalink: project.permalink_url,
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Cache for 5 minutes
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const token = process.env.ASANA_PAT;
  if (!token) {
    return res.status(500).json({ error: 'ASANA_PAT not configured' });
  }

  try {
    // Fetch all 3 portfolios in parallel
    const [setupItems, upgradeItems, reonboardingItems] = await Promise.all([
      fetchAllPortfolioItems(PORTFOLIOS.setup, token),
      fetchAllPortfolioItems(PORTFOLIOS.upgrade, token),
      fetchAllPortfolioItems(PORTFOLIOS.reonboarding, token),
    ]);

    const allProjects = [...setupItems, ...upgradeItems, ...reonboardingItems];

    // Transform and split into active/completed
    const transformed = allProjects.map(transformProject);
    const active = transformed.filter(p => !p.completed);
    const completed = transformed.filter(p => p.completed);

    return res.status(200).json({
      active,
      completed,
      meta: {
        totalActive: active.length,
        totalCompleted: completed.length,
        fetchedAt: new Date().toISOString(),
        portfolios: {
          setup: PORTFOLIOS.setup,
          upgrade: PORTFOLIOS.upgrade,
          reonboarding: PORTFOLIOS.reonboarding,
        },
      },
    });
  } catch (error) {
    console.error('Asana API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
