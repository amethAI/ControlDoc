import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface TandaInfo {
  descripcion: string;
  fecha: string;
  precio_por_camisa: number;
  club_name: string;
}

type Step = 'loading' | 'error' | 'cedula' | 'seleccion' | 'exito' | 'ya_respondido';

export default function DotacionPublica() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [tanda, setTanda] = useState<TandaInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Step cedula
  const [cedula, setCedula] = useState('');
  const [cedulaError, setCedulaError] = useState('');
  const [checkingCedula, setCheckingCedula] = useState(false);
  const [employeeName, setEmployeeName] = useState('');

  // Step seleccion
  const [cantidad, setCantidad] = useState<1 | 2 | null>(null);
  const [cuotas, setCuotas] = useState<1 | 2 | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Signature pad
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasFirma, setHasFirma] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [cantidad, cuotas]);

  const getCanvasPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleCanvasStart = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    isDrawingRef.current = true;
    const ctx = canvas.getContext('2d')!;
    const pos = getCanvasPos(e.nativeEvent as any, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  };

  const handleCanvasDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d')!;
    const pos = getCanvasPos(e.nativeEvent as any, canvas);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    if (!hasFirma) setHasFirma(true);
  };

  const handleCanvasStop = () => { isDrawingRef.current = false; };

  const clearFirma = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasFirma(false);
  };

  const getFirmaBase64 = () => {
    const canvas = canvasRef.current;
    return (canvas && hasFirma) ? canvas.toDataURL('image/png') : null;
  };

  // Result
  const [result, setResult] = useState<{ full_name: string; cantidad: number; cuotas: number; monto_total: number } | null>(null);

  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Enlace inválido'); return; }
    fetch(`/api/dotacion/public/${token}`)
      .then(r => {
        if (r.status === 410) { setStep('error'); setErrorMsg('Este enlace ya no está activo.'); return null; }
        if (!r.ok) { setStep('error'); setErrorMsg('Enlace no válido o expirado.'); return null; }
        return r.json();
      })
      .then(data => {
        if (data) { setTanda(data); setStep('cedula'); }
      })
      .catch(() => { setStep('error'); setErrorMsg('Error al cargar la información.'); });
  }, [token]);

  const handleCedula = async () => {
    if (!cedula.trim()) { setCedulaError('Ingresá tu cédula'); return; }
    setCheckingCedula(true);
    setCedulaError('');
    try {
      const res = await fetch(`/api/dotacion/public/${token}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: cedula.trim() }),
      });
      if (res.status === 409) { setStep('ya_respondido'); return; }
      if (res.status === 404) { setCedulaError('Cédula no encontrada en este club. Verificá el número.'); return; }
      if (!res.ok) { setCedulaError('Error al verificar. Intentá de nuevo.'); return; }
      const data = await res.json();
      if (data.full_name) setEmployeeName(data.full_name);
      setStep('seleccion');
    } catch {
      setCedulaError('Error al verificar. Intentá de nuevo.');
    } finally {
      setCheckingCedula(false);
    }
  };

  const handleSubmit = async () => {
    if (!cantidad || !cuotas || !accepted || !hasFirma) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dotacion/public/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: cedula.trim(), cantidad, cuotas, firma_base64: getFirmaBase64() }),
      });
      if (res.status === 409) { setStep('ya_respondido'); return; }
      if (!res.ok) {
        const e = await res.json();
        setCedulaError(e.error || 'Error al enviar');
        setStep('cedula');
        return;
      }
      const data = await res.json();
      setResult(data);
      setStep('exito');
    } catch {
      alert('Error al enviar. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const precio = tanda?.precio_por_camisa ?? 0;
  const montoTotal = cantidad ? parseFloat((cantidad * precio).toFixed(2)) : 0;
  const montoCuota = cuotas ? parseFloat((montoTotal / cuotas).toFixed(2)) : 0;
  const canConfirm = cantidad && cuotas && accepted && hasFirma;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-8 pb-16 p-4 overflow-y-auto">
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-100">

        {/* Header con marca */}
        <div className="bg-[#1a1a1a] px-6 py-5 text-center">
          <div className="text-2xl font-bold tracking-wider">
            <span className="text-[#e02020]">RED</span>
            <span className="text-[#9a9a9a] font-normal">VOLUTION</span>
          </div>
          <p className="text-[#666] text-xs mt-1 tracking-widest uppercase">Dotación de uniformes</p>
        </div>

        <div className="p-6">

          {/* Loading */}
          {step === 'loading' && (
            <div className="text-center py-8 text-slate-400 text-sm">Cargando...</div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="text-center py-8">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <p className="text-slate-700 font-medium">Enlace no disponible</p>
              <p className="text-slate-400 text-sm mt-1">{errorMsg}</p>
            </div>
          )}

          {/* Ya respondido */}
          {step === 'ya_respondido' && (
            <div className="text-center py-8">
              <CheckCircle className="h-10 w-10 text-blue-400 mx-auto mb-3" />
              <p className="text-slate-700 font-medium">Ya registraste tu selección</p>
              <p className="text-slate-400 text-sm mt-1">Tu respuesta para esta tanda ya fue recibida.</p>
            </div>
          )}

          {/* Step 1: Cédula */}
          {step === 'cedula' && tanda && (
            <>
              <p className="text-base font-semibold text-slate-800 text-center mb-1">{tanda.descripcion}</p>
              <p className="text-xs text-slate-400 text-center mb-5">{tanda.club_name}</p>

              <div className="h-px bg-slate-100 mb-5" />

              <label className="block text-xs font-medium text-slate-500 mb-1.5">Número de cédula</label>
              <input
                type="text"
                placeholder="8-123-456"
                value={cedula}
                onChange={e => { setCedula(e.target.value); setCedulaError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCedula()}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              {cedulaError && <p className="text-xs text-red-500 mt-1.5">{cedulaError}</p>}

              <button
                onClick={handleCedula}
                disabled={checkingCedula}
                className="w-full mt-4 bg-[#e02020] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#c01818] disabled:opacity-50 transition-colors"
              >
                {checkingCedula ? 'Verificando...' : 'Continuar'}
              </button>
            </>
          )}

          {/* Step 2: Selección */}
          {step === 'seleccion' && tanda && (
            <>
              {employeeName && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5 mb-4">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700">{employeeName}</p>
                    <p className="text-xs text-green-500">Cédula verificada</p>
                  </div>
                </div>
              )}

              <p className="text-xs font-medium text-slate-500 mb-2">¿Cuántas camisas querés recibir?</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {([1, 2] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setCantidad(n)}
                    className={`border rounded-lg py-3 text-sm font-medium transition-colors ${
                      cantidad === n
                        ? 'border-[#e02020] bg-red-50 text-[#c01818]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {n} camisa{n > 1 ? 's' : ''}
                    <span className="block text-xs font-normal mt-0.5 opacity-70">
                      ${(n * precio).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>

              <p className="text-xs font-medium text-slate-500 mb-2">Forma de descuento en planilla</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {([1, 2] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setCuotas(n)}
                    className={`border rounded-lg py-3 text-sm font-medium transition-colors ${
                      cuotas === n
                        ? 'border-[#e02020] bg-red-50 text-[#c01818]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {n} cuota{n > 1 ? 's' : ''}
                    <span className="block text-xs font-normal mt-0.5 opacity-70">
                      {n === 1 ? 'pago único' : 'split en planilla'}
                    </span>
                  </button>
                ))}
              </div>

              {cantidad && cuotas && (
                <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span>Camisas</span><span>{cantidad}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span>Precio por camisa</span><span>${precio.toFixed(2)}</span>
                  </div>
                  {cuotas === 2 && (
                    <div className="flex justify-between text-slate-500 mb-1">
                      <span>Por cuota</span><span>${montoCuota.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-slate-800 pt-2 border-t border-slate-200 mt-1">
                    <span>Total a descontar</span><span>${montoTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {cantidad && cuotas && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">Firma del trabajador</span>
                    {hasFirma && (
                      <button onClick={clearFirma} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                        Borrar
                      </button>
                    )}
                  </div>
                  <div className="relative border-2 border-dashed border-slate-200 rounded-lg overflow-hidden bg-white"
                       style={{ height: 110 }}>
                    {!hasFirma && (
                      <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 pointer-events-none select-none">
                        Firmá aquí con el dedo o el mouse
                      </p>
                    )}
                    <canvas
                      ref={canvasRef}
                      width={560}
                      height={220}
                      className="w-full h-full touch-none cursor-crosshair"
                      onMouseDown={handleCanvasStart}
                      onMouseMove={handleCanvasDraw}
                      onMouseUp={handleCanvasStop}
                      onMouseLeave={handleCanvasStop}
                      onTouchStart={handleCanvasStart}
                      onTouchMove={handleCanvasDraw}
                      onTouchEnd={handleCanvasStop}
                    />
                  </div>
                  {!hasFirma && (
                    <p className="text-xs text-red-400 mt-1">La firma es obligatoria para confirmar</p>
                  )}
                </div>
              )}

              {cantidad && cuotas && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={e => setAccepted(e.target.checked)}
                      className="mt-0.5 accent-[#e02020]"
                    />
                    <span className="text-xs text-amber-800 leading-relaxed">
                      Acepto que se descuente <strong>${montoTotal.toFixed(2)}</strong> de mi planilla
                      en <strong>{cuotas} cuota{cuotas > 1 ? 's' : ''}</strong> por la dotación de camisas — {tanda.descripcion}.
                    </span>
                  </label>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canConfirm || submitting}
                className="w-full bg-[#e02020] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#c01818] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Enviando...' : 'Confirmar y aceptar'}
              </button>
            </>
          )}

          {/* Step 3: Éxito */}
          {step === 'exito' && result && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-lg font-semibold text-slate-800 mb-1">
                ¡Listo, {result.full_name.split(' ')[0]}!
              </p>
              <p className="text-sm text-slate-400 mb-5">
                Tu selección fue registrada. El descuento se aplicará en tu planilla.
              </p>

              <div className="bg-slate-50 rounded-lg p-3 text-sm text-left">
                <div className="flex justify-between text-slate-500 mb-1">
                  <span>Camisas</span><span>{result.cantidad}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800 pt-2 border-t border-slate-200 mt-1">
                  <span>Total autorizado</span><span>${result.monto_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500 mt-1">
                  <span>Cuotas</span>
                  <span>
                    {result.cuotas === 1
                      ? '1 cuota (pago único)'
                      : `2 cuotas ($${(result.monto_total / 2).toFixed(2)} c/u)`}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300 mt-4">
                Tu firma digital quedó registrada en el documento de autorización.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
