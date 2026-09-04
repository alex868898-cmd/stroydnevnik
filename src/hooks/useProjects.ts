import { useState, useEffect, useCallback } from 'react';
import { Project } from '../lib/types';
import * as db from '../services/supabase';

// Module-level in-memory cache to persist between tab switches
let cachedProjects: Project[] | null = null;
let cachedUserId: string | null = null;
let listeners: Array<(projects: Project[]) => void> = [];

const updateCache = (newProjects: Project[]) => {
  cachedProjects = newProjects;
  listeners.forEach(listener => listener(newProjects));
};

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(cachedProjects || []);
  const [loading, setLoading] = useState(!cachedProjects);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const listener = (updatedProjects: Project[]) => {
      setProjects(updatedProjects);
    };
    listeners.push(listener);
    
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);

  const fetchProjects = useCallback(async (force = false) => {
    const { data: { user } } = await db.supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    if (cachedUserId !== user.id) {
      cachedProjects = null;
      cachedUserId = user.id;
    }

    if (cachedProjects && !force) {
      setProjects(cachedProjects);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const data = await db.getProjects();
      updateCache(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const { data: { subscription } } = db.supabase.auth.onAuthStateChange(event => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setTimeout(() => fetchProjects(true), 0);
      }
      if (event === 'SIGNED_OUT') {
        cachedProjects = null;
        cachedUserId = null;
        setProjects([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProjects]);

  const addProject = useCallback(async (name: string, address?: string) => {
    try {
      const newProj = await db.createProject(name, address);
      if (cachedProjects) {
        updateCache([newProj, ...cachedProjects]);
      } else {
        updateCache([newProj]);
      }
      return newProj;
    } catch (err) {
      console.error('Error adding project:', err);
      throw err;
    }
  }, []);

  const changeStatus = useCallback(async (id: string, status: Project['status']) => {
    try {
      const updatedProj = await db.updateProjectStatus(id, status);
      if (cachedProjects) {
        const nextProjects = cachedProjects.map(p => p.id === id ? updatedProj : p);
        updateCache(nextProjects);
      }
      return updatedProj;
    } catch (err) {
      console.error('Error changing project status:', err);
      throw err;
    }
  }, []);

  const removeProject = useCallback(async (id: string) => {
    try {
      await db.deleteProject(id);
      if (cachedProjects) {
        const nextProjects = cachedProjects.filter(p => p.id !== id);
        updateCache(nextProjects);
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      throw err;
    }
  }, []);

  return {
    projects,
    loading,
    error,
    refresh: () => fetchProjects(true),
    addProject,
    changeStatus,
    removeProject,
  };
}

export function clearProjectsCache() {
  cachedProjects = null;
  cachedUserId = null;
}
