import { Link } from "react-router-dom";
import { Activity } from "lucide-react";

interface LogoProps {
  collapsed?: boolean;
  className?: string;
}

export const Logo = ({ collapsed = false, className = "" }: LogoProps) => {
  return (
    <Link to="/" className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary shadow-sm transition-transform hover:scale-105">
        <Activity className="h-4 w-4 text-white" />
      </div>
      {!collapsed && (
        <span className="text-lg font-semibold tracking-tight text-foreground">
          Medi<span className="text-primary">voz</span>
        </span>
      )}
    </Link>
  );
};
