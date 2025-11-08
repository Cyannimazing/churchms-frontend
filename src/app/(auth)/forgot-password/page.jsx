"use client";

import Button from "@/components/Button.jsx";
import Input from "@/components/Input.jsx";
import InputError from "@/components/InputError.jsx";
import Label from "@/components/Label.jsx";
import { useAuth } from "@/hooks/auth.jsx";
import { useEffect, useState } from "react";
import AuthSessionStatus from "@/app/(auth)/AuthSessionStatus.jsx";
import AuthCard from "../AuthCard";
import { Loader2 } from "lucide-react";

const Page = () => {
  const { forgotPassword } = useAuth({
    middleware: "guest",
    redirectIfAuthenticated: "/dashboard",
  });

  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submitForm = async (event) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      await forgotPassword({ email, setErrors, setStatus });
      setCooldown(30);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="mb-4 text-sm text-gray-600">
        Forgot your password? No problem. Just let us know your email address
        and we will email you a password reset link that will allow you to
        choose a new one.
      </div>

      {/* Session Status */}
      <AuthSessionStatus className="mb-4" status={status} />

      <form onSubmit={submitForm}>
        {/* Email Address */}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            name="email"
            value={email}
            className="block mt-1 w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="juan.delacruz@gmail.com"
            required
            autoFocus
          />

          <InputError messages={errors.email} className="mt-2" />
        </div>

        <div className="flex items-center justify-end mt-4">
          <Button 
            type="submit"
            disabled={isLoading || cooldown > 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              cooldown > 0 ? `Resend in ${cooldown}s` : "Email Password Reset Link"
            )}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
};

export default Page;
