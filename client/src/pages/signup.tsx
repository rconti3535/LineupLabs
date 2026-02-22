import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { insertUserSchema } from "@shared/schema";

const signupSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupForm = z.infer<typeof signupSchema>;

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { login } = useAuth();

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      name: "",
      avatar: "",
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: Omit<SignupForm, "confirmPassword">) => {
      const response = await apiRequest("POST", "/api/users", data);
      return await response.json();
    },
    onSuccess: (user) => {
      login(user.id);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      setLocation(redirect || "/");
    },
    onError: (error: any) => {
      let description = "Could not create account. Please try again.";
      const msg = error?.message ?? "";
      const match = msg.match(/^\d+\s*:\s*(.+)$/);
      if (match) {
        try {
          const body = JSON.parse(match[1]);
          if (typeof body?.message === "string") description = body.message;
        } catch {
          if (match[1]) description = match[1];
        }
      } else if (msg) description = msg;
      toast({
        title: "Signup failed",
        description,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SignupForm) => {
    const { confirmPassword, ...signupData } = data;
    signupMutation.mutate({ ...signupData, name: signupData.username });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <Card className="gradient-card rounded-xl p-8 w-full max-w-md border-0">
        <div className="text-center mb-8">
          <div className="w-12 h-12 primary-gradient rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 text-white"
              fill="currentColor"
            >
              <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 4L13.5 3.5C13.1 3.4 12.6 3.4 12.2 3.5L7 5.3L3 7V9L7 7.1L12 9L17 7.1L21 9ZM7.5 17.5L9 16L7.5 14.5L6 16L7.5 17.5ZM12 13.5C11.2 13.5 10.5 14.2 10.5 15S11.2 16.5 12 16.5 13.5 15.8 13.5 15 12.8 13.5 12 13.5ZM16.5 17.5L18 16L16.5 14.5L15 16L16.5 17.5Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Join FantasyBall</h1>
          <p className="text-gray-400">Create your account to get started</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Choose a username"
                      className="sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="username"
                      spellCheck={false}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      className="sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="email"
                      spellCheck={false}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Create a password"
                      className="sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Confirm your password"
                      className="sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={signupMutation.isPending}
              className="w-full primary-gradient rounded-xl py-3 text-white font-medium hover:opacity-90 transition-opacity"
            >
              {signupMutation.isPending ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </Form>

        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">
            Already have an account?{" "}
            <Link href={`/login${window.location.search}`}>
              <span className="text-blue-400 hover:text-blue-300 cursor-pointer">
                Sign in here
              </span>
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}