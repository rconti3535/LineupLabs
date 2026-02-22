import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  user: any;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (userId: number) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<number | null>(() => {
    const stored = localStorage.getItem("currentUserId");
    return stored ? parseInt(stored) : null;
  });

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/users", currentUserId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${currentUserId}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    enabled: currentUserId !== null,
    retry: false,
  });

  const login = useCallback((userId: number) => {
    setCurrentUserId(userId);
    localStorage.setItem("currentUserId", userId.toString());
    queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
  }, [queryClient]);

  const logout = useCallback(() => {
    setCurrentUserId(null);
    localStorage.removeItem("currentUserId");
    queryClient.clear();
  }, [queryClient]);

  const isAuthenticated = !!currentUserId && (!!user || isLoading);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: currentUserId !== null && isLoading,
        isAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
