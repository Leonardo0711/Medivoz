
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface PatientDialogActionsProps {
  isSubmitting: boolean;
  isEditing: boolean;
  onCancel: () => void;
}

export function PatientDialogActions({ isSubmitting, isEditing, onCancel }: PatientDialogActionsProps) {
  return (
    <DialogFooter>
      <Button 
        type="button" 
        variant="outline" 
        onClick={onCancel}
        disabled={isSubmitting}
      >
        Cancelar
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isEditing ? 'Actualizando...' : 'Guardando...'}
          </>
        ) : isEditing ? 'Actualizar Paciente' : 'Guardar Paciente'}
      </Button>
    </DialogFooter>
  );
}
