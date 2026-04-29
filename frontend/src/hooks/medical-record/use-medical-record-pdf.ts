
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { toast } from "sonner";
import { PatientData, MedicalRecordFormData } from "./use-medical-record-api";
import { logger } from "@/utils/logger";

export const exportMedicalRecordPDF = async (
  patientData: PatientData | null,
  formData: MedicalRecordFormData,
  setIsExporting: (value: boolean) => void
): Promise<boolean> => {
  if (!patientData || !formData.motivo_consulta) {
    toast.error("No hay datos suficientes para exportar");
    return false;
  }
  
  setIsExporting(true);
  
  try {
    // Generate PDF
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(16);
    doc.setTextColor(59, 130, 246); // Blue color
    doc.text("FICHA MÉDICA", 105, 15, { align: "center" });
    
    // Add today's date and time
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100); // Gray color
    const today = new Date().toLocaleDateString('es-ES');
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Fecha: ${today} - ${time}`, 195, 15, { align: "right" });
    
    // Patient information
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Paciente: ${patientData.nombre}`, 14, 25);
    doc.text(`Edad: ${patientData.edad || 'No especificada'}`, 14, 32);
    
    if (patientData.ocupacion) {
      doc.text(`Ocupación: ${patientData.ocupacion}`, 14, 39);
    }
    
    if (patientData.procedencia) {
      doc.text(`Procedencia: ${patientData.procedencia}`, 14, 46);
    }
    
    // Line separator
    doc.setDrawColor(200, 200, 200); // Light gray
    doc.line(14, 50, 196, 50);
    
    // Medical record content
    doc.setFontSize(11);
    
    let yPos = 60;
    
    const addSection = (label: string, value?: string, extraSpacing = 7) => {
      if (!value) return;
      
      const remainingSpace = 280 - yPos;
      const textLines = doc.splitTextToSize(value, 170);
      const textHeight = textLines.length * 7 + extraSpacing;

      if (remainingSpace < textHeight) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFont(undefined, "bold");
      doc.text(`${label}:`, 14, yPos);
      doc.setFont(undefined, "normal");
      doc.text(textLines, 14, yPos + extraSpacing);
      yPos += textHeight;
    };

    addSection("Motivo de Consulta", formData.motivo_consulta);
    addSection("Tiempo de Enfermedad", formData.tiempo_enfermedad);
    addSection("Forma de Inicio", formData.forma_inicio);
    addSection("Curso de la Enfermedad", formData.curso_enfermedad);
    addSection("Historia Cronológica de la Enfermedad Actual", formData.historia_cronologica, 8);
    addSection("Antecedentes", formData.antecedentes);
    addSection("Estado Funcional Basal", formData.estado_funcional_basal);
    addSection("Estudios Previos Mencionados", formData.estudios_previos);
    addSection("Síntomas Principales", formData.sintomas_principales);
    addSection("Notas Adicionales", formData.notas_adicionales);
    
    // Save the PDF
    const fileName = `ficha_medica_${patientData.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
    toast.success("PDF exportado exitosamente");
    return true;
  } catch (error) {
    logger.error("Error exporting PDF:", error);
    toast.error("Error al exportar el PDF");
    return false;
  } finally {
    setIsExporting(false);
  }
};
