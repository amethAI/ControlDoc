import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { apiFetch } from '../lib/api';

interface ImportDatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const parseSpanishDate = (dateStr: string | number): string | null => {
  if (dateStr === undefined || dateStr === null) return null;
  
  // Handle Excel serial dates (numbers)
  if (typeof dateStr === 'number') {
    // Excel dates are number of days since Jan 1, 1900
    // 25569 is the offset between 1900-01-01 and 1970-01-01
    const date = new Date((dateStr - 25569) * 86400 * 1000);
    // Adjust for timezone offset to get the correct local date
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const finalDate = new Date(date.getTime() + userTimezoneOffset);
    return finalDate.toISOString().split('T')[0];
  }

  const str = String(dateStr).trim();
  if (str === '') return null;
  
  // Try to match DD-MMM-YY (e.g., 30-Jul-28)
  const parts = str.split('-');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const monthStr = parts[1].toLowerCase();
    let year = parts[2];
    
    // Handle 2-digit years
    if (year.length === 2) {
      year = `20${year}`;
    }

    const months: Record<string, string> = {
      'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
      'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
    };

    const month = months[monthStr];
    if (day && month && year) {
      return `${year}-${month}-${day}`; // YYYY-MM-DD
    }
  }

  // Fallback: try standard Date parsing if it's already in a recognizable format
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
};

export default function ImportDatesModal({ isOpen, onClose, onSuccess }: ImportDatesModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ success: boolean; message: string; errors: string[] } | null>(null);

  if (!isOpen) return null;

  const handleProcess = () => {
    if (!file) {
      toast.error('Por favor selecciona un archivo Excel o CSV');
      return;
    }

    setLoading(true);
    setResults(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const isCSV = file.name.toLowerCase().endsWith('.csv');
        
        let workbook;
        if (isCSV && typeof data === 'string') {
          workbook = XLSX.read(data, { type: 'string' });
        } else {
          workbook = XLSX.read(data, { type: 'array' });
        }
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

        // Find the header row (the one that contains 'NOMBRE' or similar)
        let headerRowIndex = -1;
        
        // Scan up to 50 rows to find the header
        for (let i = 0; i < Math.min(rows.length, 50); i++) {
          const row = rows[i] || [];
          
          // Check every cell in the row
          for (let j = 0; j < row.length; j++) {
            const cellValue = String(row[j] || '').toLowerCase().trim();
            
            // If we find a cell that looks like 'nombre' or 'empleado'
            if (cellValue === 'nombre' || cellValue === 'empleado' || cellValue === 'nombres' || cellValue.includes('nombre') || cellValue.includes('empleado')) {
              headerRowIndex = i;
              break; // Break inner loop
            }
          }
          
          if (headerRowIndex !== -1) {
            break; // Break outer loop if found
          }
          
          // Fallback for poorly formatted CSVs read as single string
          if (row.length === 1 && typeof row[0] === 'string') {
             const rowString = row[0].toLowerCase();
             if (rowString.includes('nombre') || rowString.includes('empleado')) {
                const separator = row[0].includes(';') ? ';' : (row[0].includes(',') ? ',' : '\t');
                rows[i] = row[0].split(separator).map(s => s.trim());
                headerRowIndex = i;
                
                for(let k = i + 1; k < rows.length; k++) {
                  if (rows[k].length === 1 && typeof rows[k][0] === 'string') {
                    rows[k] = rows[k][0].split(separator).map(s => s.trim());
                  }
                }
                break;
             }
          }
        }

        if (headerRowIndex === -1) {
          toast.error('No se encontró la columna "NOMBRE". Asegúrate de que el archivo tenga los encabezados correctos.');
          setLoading(false);
          return;
        }

        const headers = rows[headerRowIndex].map(h => String(h || '').trim());
        
        const rawRecords = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i] || [];
          const record: any = {};
          for (let j = 0; j < headers.length; j++) {
            if (headers[j]) {
              record[headers[j]] = row[j];
            }
          }
          // Only push if the row has some actual data
          if (Object.values(record).some(val => val !== '' && val !== null && val !== undefined)) {
            rawRecords.push(record);
          }
        }

        const records = rawRecords.map((row: any) => {
          // Find columns dynamically (case insensitive)
          const getCol = (keywords: string[]) => {
            const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
            return key ? row[key] : null;
          };

          const name = getCol(['nombre', 'empleado', 'demostradora']);
          const carnetVerdeRaw = getCol(['verde', 'salud']);
          const carnetBlancoRaw = getCol(['blanco', 'adestramiento', 'adiestramiento']);
          const tipoContratoRaw = getCol(['tipo de contrato', 'tipo de contratos']);
          const fechaTerminacionContratoRaw = getCol(['fecha de terminación de contrato', 'terminación de contrato', 'terminacion de contrato', 'fecha de terminación d', 'fecha de terminacion']);

          return {
            name,
            carnetVerde: carnetVerdeRaw ? parseSpanishDate(carnetVerdeRaw) : null,
            carnetBlanco: carnetBlancoRaw ? parseSpanishDate(carnetBlancoRaw) : null,
            tipoContrato: tipoContratoRaw ? String(tipoContratoRaw).trim().toUpperCase() : null,
            fechaTerminacionContrato: fechaTerminacionContratoRaw ? parseSpanishDate(fechaTerminacionContratoRaw) : null
          };
        }).filter(r => r.name); // Only keep rows with a name

        if (records.length === 0) {
          toast.error('No se encontraron registros válidos en el archivo. Verifica que tenga una columna "NOMBRE".');
          setLoading(false);
          return;
        }

        const res = await apiFetch('/api/import-document-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records })
        });

        const responseData = await res.json();
        
        if (res.ok) {
          setResults(responseData);
          if (responseData.errors.length === 0) {
            toast.success('Importación completada con éxito');
            setTimeout(() => {
              onSuccess();
              onClose();
            }, 2000);
          } else {
            toast.warning('Importación completada con algunas advertencias');
            onSuccess();
          }
        } else {
          toast.error(responseData.error || 'Error al procesar el archivo');
          setResults({ success: false, message: 'Error', errors: [responseData.error || 'Error desconocido'] });
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        toast.error('Error al leer el archivo. Asegúrate de que sea un Excel (.xlsx) o CSV válido.');
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      toast.error('Error al leer el archivo');
      setLoading(false);
    };

    const isCSV = file.name.toLowerCase().endsWith('.csv');
    
    if (isCSV) {
      reader.readAsText(file, 'windows-1252'); // Handle Spanish characters in CSV
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div className="fixed inset-0 bg-slate-900/50 transition-opacity" onClick={onClose} />
        
        <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-6 w-6 text-green-600" />
                <h3 className="text-lg font-semibold leading-6 text-slate-900">
                  Importar Fechas de Vencimiento
                </h3>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!results ? (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
                  <p className="font-medium mb-1">Instrucciones:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Sube un archivo en formato <strong>Excel (.xlsx)</strong> o <strong>CSV</strong>.</li>
                    <li>Debe contener una columna llamada <strong>"NOMBRE"</strong>.</li>
                    <li>Debe contener columnas para <strong>"CARNET VERDE"</strong> y <strong>"CARNET BLANCO"</strong>.</li>
                    <li>Las fechas deben estar en formato <strong>DD-MMM-YY</strong> (ej. 30-Jul-28) o <strong>YYYY-MM-DD</strong>.</li>
                  </ul>
                </div>

                <div>
                  <div 
                    className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-green-400 transition-colors cursor-pointer bg-slate-50" 
                    onClick={() => document.getElementById('csv-upload')?.click()}
                  >
                    <div className="space-y-1 text-center">
                      <Upload className="mx-auto h-12 w-12 text-slate-400" />
                      <div className="flex text-sm text-slate-600 justify-center">
                        <span className="relative cursor-pointer rounded-md font-medium text-green-600 hover:text-green-500">
                          {file ? file.name : 'Seleccionar archivo Excel o CSV'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">Archivos .xlsx o .csv</p>
                    </div>
                    <input 
                      id="csv-upload" 
                      type="file" 
                      className="sr-only" 
                      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>

                <div className="mt-5 sm:mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleProcess}
                    disabled={loading || !file}
                    className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50"
                  >
                    {loading ? 'Procesando...' : 'Procesar Archivo'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${results.errors.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                  <p className={`font-medium ${results.errors.length > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                    {results.message}
                  </p>
                </div>

                {results.errors.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-slate-900 flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      Advertencias ({results.errors.length})
                    </h4>
                    <div className="max-h-40 overflow-y-auto bg-slate-50 p-3 rounded border border-slate-200 text-sm text-slate-600">
                      <ul className="list-disc pl-5 space-y-1">
                        {results.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="mt-5 sm:mt-6">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
