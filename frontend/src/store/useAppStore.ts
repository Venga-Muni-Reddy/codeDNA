import { create } from 'zustand';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface ProjectData {
  _id: string;
  name: string;
  sourceType: string;
  repoUrl?: string;
  branch: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  techStack: string[];
  currentCommit?: string;
  createdAt: string;
}

interface AppState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  projects: ProjectData[];
  activeProject: ProjectData | null;
  setAuth: (user: UserProfile, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  setProjects: (projects: ProjectData[]) => void;
  setActiveProject: (project: ProjectData | null) => void;
  updateProjectStatus: (projectId: string, status: ProjectData['status'], techStack?: string[], error?: string) => void;
}

export const useAppStore = create<AppState>((set) => {
  // Try loading initial state from localStorage
  const savedToken = localStorage.getItem('accessToken');
  const savedRefresh = localStorage.getItem('refreshToken');
  const savedUser = localStorage.getItem('user');

  return {
    user: savedUser ? JSON.parse(savedUser) : null,
    accessToken: savedToken || null,
    refreshToken: savedRefresh || null,
    projects: [],
    activeProject: null,

    setAuth: (user, accessToken, refreshToken) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, accessToken, refreshToken });
    },

    clearAuth: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      set({ user: null, accessToken: null, refreshToken: null, activeProject: null, projects: [] });
    },

    setProjects: (projects) => set({ projects }),

    setActiveProject: (activeProject) => set({ activeProject }),

    updateProjectStatus: (projectId, status, techStack, error) =>
      set((state) => {
        const updatedProjects = state.projects.map((p) => {
          if (p._id === projectId) {
            return {
              ...p,
              status,
              techStack: techStack || p.techStack,
              errorMessage: error || p.errorMessage,
            };
          }
          return p;
        });

        const activeProj =
          state.activeProject?._id === projectId
            ? {
                ...state.activeProject,
                status,
                techStack: techStack || state.activeProject.techStack,
                errorMessage: error || state.activeProject.errorMessage,
              }
            : state.activeProject;

        return {
          projects: updatedProjects,
          activeProject: activeProj,
        };
      }),
  };
});
