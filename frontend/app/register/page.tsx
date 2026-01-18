"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Password strength validation
  const validatePassword = (pwd: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (pwd.length < 8) {
      errors.push("At least 8 characters");
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push("One uppercase letter");
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push("One lowercase letter");
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push("One number");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (password !== confirmPassword) {
      toast.error("Passwords don't match", {
        description: "Please make sure both passwords are the same.",
      });
      return;
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      toast.error("Weak password", {
        description: `Password must have: ${validation.errors.join(", ")}`,
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await authApi.register(email, password, confirmPassword);

      // Store tokens
      setTokens(result.tokens.accessToken, result.tokens.refreshToken);

      toast.success("Account created!", {
        description: "Welcome to Smart Bookmarks",
      });

      // Redirect to home
      router.push("/");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Registration failed";

      // Check for specific error types
      if (errorMessage.includes("already exists")) {
        toast.error("Email already registered", {
          description: "This email is already in use. Try logging in instead.",
        });
      } else if (errorMessage.includes("Password must")) {
        toast.error("Invalid password", {
          description: errorMessage,
        });
      } else {
        toast.error("Registration failed", {
          description: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Real-time password strength indicator
  const passwordValidation = validatePassword(password);
  const showPasswordHelp = password.length > 0 && !passwordValidation.valid;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Create Account
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Start organizing your bookmarks with AI
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
            />
            {showPasswordHelp && (
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                <p className="font-medium mb-1">Password must have:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {passwordValidation.errors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
            />
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                Passwords don't match
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-300 dark:border-slate-600" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-800 px-2 text-slate-500 dark:text-slate-400">
                Or continue with
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full mt-4"
            onClick={() => {
              window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/google`;
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign up with Google
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full mt-2"
            onClick={() => {
              window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/github`;
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Sign up with GitHub
          </Button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-center text-slate-500 dark:text-slate-500">
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
