
import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Save, FileText, X, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MedicalRecordActionsProps {
  isSaving: boolean;
  isExporting: boolean;
  onClose?: () => void;
  onSave: () => void;
  onExport: () => void;
  showCloseButton?: boolean;
}

export const MedicalRecordActions = memo(function MedicalRecordActions({ 
  isSaving, 
  isExporting, 
  onClose, 
  onSave, 
  onExport,
  showCloseButton = true
}: MedicalRecordActionsProps) {
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return (
    <div className="flex flex-col w-full gap-2 sm:flex-row sm:justify-between">
      {showCloseButton && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="outline" 
                onClick={handleClose} 
              className="flex-shrink-0 text-sm hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
              size="sm"
            >
              <X className="h-4 w-4 mr-2" />
              Cerrar sin guardar
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Cerrar la ficha sin guardar los cambios</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={onExport} 
                variant="secondary" 
                disabled={isExporting} 
                className="flex-1 text-sm bg-secondary/80 hover:bg-secondary"
                size="sm"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Exportar PDF
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Generar archivo PDF de la ficha médica</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={onSave} 
                disabled={isSaving} 
                className="flex-1 bg-primary hover:bg-primary/90 text-sm"
                size="sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Guardar Ficha
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Guardar la ficha médica en la base de datos</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
});
