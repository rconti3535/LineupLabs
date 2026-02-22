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

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { login } = useAuth();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
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
      toast({
        title: "Login failed",
        description: error?.message || "Invalid username or password. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate(data);
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
          <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400">Sign in to your account</p>
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
                      placeholder="Enter your username"
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Enter your password"
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
              disabled={loginMutation.isPending}
              className="w-full primary-gradient rounded-xl py-3 text-white font-medium hover:opacity-90 transition-opacity"
            >
              {loginMutation.isPending ? "Signing In..." : "Sign In"}
            </Button>
          </form>
        </Form>

        <div className="mt-4 text-center">
          <p className="text-gray-400 text-sm">
            <Link href="/reset-password">
              <span className="text-blue-400 hover:text-blue-300 cursor-pointer">
                Forgot your password?
              </span>
            </Link>
          </p>
        </div>

        <div className="mt-3 text-center">
          <p className="text-gray-400 text-sm">
            Don't have an account?{" "}
            <Link href={`/signup${window.location.search}`}>
              <span className="text-blue-400 hover:text-blue-300 cursor-pointer">
                Create one here
              </span>
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}