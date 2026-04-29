
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { UseFormReturn } from "react-hook-form";
import { PatientFormValues } from "./PatientDialogTypes";

interface PatientFormFieldsProps {
  form: UseFormReturn<PatientFormValues>;
}

export function PatientFormFields({ form }: PatientFormFieldsProps) {
  return (
    <>
      <FormField
        control={form.control}
        name="nombre"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre completo*</FormLabel>
            <FormControl>
              <Input placeholder="Juan Pérez" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="dni"
        render={({ field }) => (
          <FormItem>
            <FormLabel>DNI*</FormLabel>
            <FormControl>
              <Input placeholder="12345678" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="edad"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Edad</FormLabel>
            <FormControl>
              <Input 
                placeholder="30" 
                type="number" 
                onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                value={field.value === null ? "" : field.value}
              />
            </FormControl>
            <FormDescription>Opcional</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="ocupacion"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Ocupación</FormLabel>
            <FormControl>
              <Input placeholder="Ingeniero" {...field} />
            </FormControl>
            <FormDescription>Opcional</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="procedencia"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Procedencia</FormLabel>
            <FormControl>
              <Input placeholder="Buenos Aires" {...field} />
            </FormControl>
            <FormDescription>Opcional</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="diagnostico"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Diagnóstico</FormLabel>
            <FormControl>
              <Input placeholder="Diagnóstico preliminar" {...field} />
            </FormControl>
            <FormDescription>Opcional</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
