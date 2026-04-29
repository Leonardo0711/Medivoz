
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Sun 
        size={18} 
        className={cn(
          "text-primary transition-colors duration-200",
          theme === "dark" && "text-muted-foreground/50"
        )} 
      />
      <Switch 
        checked={theme === "dark"}
        onCheckedChange={toggleTheme}
        aria-label="Toggle dark mode"
        className="transition-all duration-200"
      />
      <Moon 
        size={18} 
        className={cn(
          "text-primary transition-colors duration-200",
          theme === "light" && "text-muted-foreground/50"
        )} 
      />
    </div>
  );
}

export function ThemeToggleButton({ variant = "outline", size = "icon", className }: { variant?: "outline" | "ghost"; size?: "icon" | "sm"; className?: string }) {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggleTheme}
      className={className}
      aria-label="Toggle dark mode"
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </Button>
  );
}
