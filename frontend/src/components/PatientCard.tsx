import { memo } from "react";
import { Link } from "react-router-dom";
import { Calendar, Edit, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

interface PatientCardProps {
  id: string;
  name: string;
  age: number;
  lastVisit: string;
  diagnosis?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewRecord?: () => void;
}

export const PatientCard = memo(function PatientCard({
  id,
  name,
  age,
  lastVisit,
  diagnosis,
  onEdit,
  onDelete,
  onViewRecord,
}: PatientCardProps) {
  return (
    <Card className="overflow-hidden border-border/50 shadow-sm transition-shadow hover:shadow-md dark:border-muted/20">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary transition-colors dark:bg-primary/20">
            {name.charAt(0)}
          </div>
          <div className="space-y-1">
            <div className="text-lg font-semibold">{name}</div>
            <div className="text-sm text-muted-foreground">
              {age > 0 ? `${age} anos` : "Edad no especificada"}
            </div>
            {diagnosis && (
              <div className="mt-2 text-sm">
                <span className="font-medium">Diagnostico:</span> {diagnosis}
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-col space-y-3 bg-muted/40 p-4 dark:bg-muted/10">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center text-xs text-muted-foreground">
            <Calendar className="mr-1 h-3 w-3" />
            Ultima visita: {lastVisit}
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={(e) => {
                  e.preventDefault();
                  onEdit();
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  onDelete();
                }}
              >
                <Trash className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <Link to={`/session?patientId=${id}`} className="w-full">
          <Button size="sm" variant="outline" className="w-full">
            Nueva sesion
          </Button>
        </Link>

        {onViewRecord && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full text-primary hover:text-primary/80"
            onClick={(e) => {
              e.preventDefault();
              onViewRecord();
            }}
          >
            Ver ficha medica
          </Button>
        )}
      </CardFooter>
    </Card>
  );
});
