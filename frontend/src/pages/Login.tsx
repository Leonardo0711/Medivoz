import { LoginForm } from "@/components/auth/LoginForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function Login() {
  return (
    <div className="relative">
      <div className="fixed left-3 top-3 z-20 sm:left-5 sm:top-5">
        <Button variant="outline" size="sm" asChild className="gap-2 bg-background/80 backdrop-blur-md">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Inicio
          </Link>
        </Button>
      </div>
      <LoginForm />
    </div>
  );
}
