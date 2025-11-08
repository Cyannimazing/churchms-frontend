"use client";

import Button from "@/components/Button";
import { useAuth } from "@/hooks/auth";
import { useState } from "react";
import AuthCard from "../AuthCard";
import { Loader2 } from "lucide-react";

const Page = () => {
  const { logout, resendEmailVerification } = useAuth({
    middleware: "auth",
    redirectIfAuthenticated: "/dashboard",
  });

  const [status, setStatus] = useState(null);
  const [isResending, setIsResending] = useState(false);

  return (
    <AuthCard>
      <div className="mb-4 text-sm text-gray-600">
        Thanks for signing up! Before getting started, could you verify your
        email address by clicking on the link we just emailed to you? If you
        didn&apos;t receive the email, we will gladly send you another.
      </div>

      {status === "verification-link-sent" && (
        <div className="mb-4 font-medium text-sm text-green-600">
          A new verification link has been sent to the email address you
          provided during registration.
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button 
          onClick={async () => {
            setIsResending(true);
            try {
              await resendEmailVerification({ setStatus });
            } finally {
              setIsResending(false);
            }
          }}
          disabled={isResending}
        >
          {isResending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            "Resend Verification Email"
          )}
        </Button>

        <button
          type="button"
          className="underline text-sm text-gray-600 hover:text-gray-900"
          onClick={logout}
        >
          Logout
        </button>
      </div>
    </AuthCard>
  );
};

export default Page;
