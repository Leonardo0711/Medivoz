
import { memo } from "react";
import { UserRound } from "lucide-react";

interface PatientInfoCardProps {
  name: string;
  age: number | null;
  occupation: string | null;
  location: string | null;
}

export const PatientInfoCard = memo(function PatientInfoCard({ name, age, occupation, location }: PatientInfoCardProps) {
  return (
    <div className="bg-primary-50 border border-primary-100 rounded-md p-3 md:p-4 mb-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-primary-100 p-1.5 rounded-full">
          <UserRound className="h-5 w-5 text-primary" />
        </div>
        <h4 className="font-semibold text-primary-900">Información del Paciente</h4>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex flex-col md:flex-row md:items-center py-1">
          <span className="font-medium text-gray-700 w-24 mb-1 md:mb-0">Nombre:</span>
          <span className="text-gray-900">{name}</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center py-1">
          <span className="font-medium text-gray-700 w-24 mb-1 md:mb-0">Edad:</span>
          <span className="text-gray-900">{age !== null ? `${age} años` : "No especificada"}</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center py-1">
          <span className="font-medium text-gray-700 w-24 mb-1 md:mb-0">Ocupación:</span>
          <span className="text-gray-900">{occupation || "No especificada"}</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center py-1">
          <span className="font-medium text-gray-700 w-24 mb-1 md:mb-0">Procedencia:</span>
          <span className="text-gray-900">{location || "No especificada"}</span>
        </div>
      </div>
    </div>
  );
});
