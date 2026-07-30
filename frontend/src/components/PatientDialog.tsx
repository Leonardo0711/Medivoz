import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "@/lib/api";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { PatientFormFields } from "@/components/patients/PatientFormFields";
import { PatientDialogActions } from "@/components/patients/PatientDialogActions";
import { 
  patientFormSchema, 
  PatientFormValues, 
  Patient, 
  PatientDialogMode 
} from "@/components/patients/PatientDialogTypes";

interface PatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  patient?: Patient | null;
  mode?: PatientDialogMode;
}

export function PatientDialog({ 
  open, 
  onOpenChange, 
  onSuccess, 
  patient, 
  mode = 'create' 
}: PatientDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = mode === 'edit';
  
  // Initialize form
  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      nombre: "",
      dni: "",
      edad: null,
    },
  });
  
  // Update form values when editing a patient
  useEffect(() => {
    if (isEditing && patient) {
      form.reset({
        nombre: patient.nombre,
        dni: patient.dni || "",
        edad: patient.edad,
      });
    } else if (!isEditing) {
      form.reset({
        nombre: "",
        dni: "",
        edad: null,
      });
    }
  }, [isEditing, patient, form, open]);
  
  const onSubmit = async (data: PatientFormValues) => {
    setIsSubmitting(true);
    
    try {
      if (isEditing && patient) {
        // Update existing patient
        await api.patch(`/clinical/patients/${patient.id}`, {
          nombre: data.nombre,
          dni: data.dni?.trim() || undefined,
          edad: data.edad ?? null,
        });
        
        toast.success("Paciente actualizado correctamente");
      } else {
        // Create new patient
        await api.post('/clinical/patients', {
          nombre: data.nombre,
          dni: data.dni?.trim() || undefined,
          edad: data.edad ?? null,
        });
        
        toast.success("Paciente registrado correctamente");
      }
      
      form.reset();
      onOpenChange(false);
      if (onSuccess) onSuccess();
      
    } catch (error: unknown) {
      logger.error(`Error ${isEditing ? 'actualizando' : 'registrando'} paciente:`, error);
      // Improve error message for user
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      if (errorMessage.includes("policy")) {
         toast.error(`Error de permisos: No tienes autorización para realizar esta acción.`);
      } else {
         toast.error(`Error al ${isEditing ? 'actualizar' : 'registrar'} paciente: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Paciente' : 'Nuevo Paciente'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Actualice los datos del paciente seleccionado.'
              : 'Registra nombre completo, DNI y edad. Solo el nombre es obligatorio en fase 1.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <PatientFormFields form={form} />
            
            <PatientDialogActions 
              isSubmitting={isSubmitting} 
              isEditing={isEditing} 
              onCancel={() => onOpenChange(false)} 
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
