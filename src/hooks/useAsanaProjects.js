import { useState, useEffect, useCallback } from 'react';

const CACHE_KEY = 'asana_projects_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch { /* ignore quota errors */ }
}

export function useAsanaProjects() {
  const [data, setData] = useState(() => getCache());
  const [loading, setLoading] = useState(!getCache());
  const [error, setError] = useState(null);

  const fetchProjects = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCache();
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/projects');
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error ${res.status}: ${errText}`);
      }

      const json = await res.json();
      setData(json);
      setCache(json);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const refresh = useCallback(() => {
    sessionStorage.removeItem(CACHE_KEY);
    return fetchProjects(true);
  }, [fetchProjects]);

  return {
    active: data?.active || [],
    completed: data?.completed || [],
    meta: data?.meta || null,
    loading,
    error,
    refresh,
  };
}
