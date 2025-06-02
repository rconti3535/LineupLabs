import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const [currentUserId, setCurrentUserId] = useState<number | null>(() => {
    const stored = localStorage.getItem("currentUserId");
    return stored ? parseInt(stored) : null;
  });

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/users", currentUserId],
    enabled: currentUserId !== null,
    retry: false,
  });

  const login = (userId: number) => {
    setCurrentUserId(userId);
    localStorage.setItem("currentUserId", userId.toString());
  };

  const logout = () => {
    setCurrentUserId(null);
    localStorage.removeItem("currentUserId");
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !!currentUserId,
    login,
    logout,
  };
}