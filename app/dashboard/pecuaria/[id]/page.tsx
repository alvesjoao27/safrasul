'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

type Animal = {
  id: string
  nome: string | null
  brinco: string | null
  sisbov: string | null
  sexo: string | null
  raca: string | null
  data_nascimento: string | null
  peso_entrada_kg: number | null
  foto_url: string | null
  finalidade: 'corte' | 'leite' | 'dupla_aptidao' | null
  ultimo_cio: string | null
  prenhez: string | null
  data_parto_previsto: string | null
  observacoes: string | null
  status: string
  lotes_animais: { nome: string; especie: string } | null
}

type Evento = {
  id: string
  tipo: string
  data: string
  descricao: string | null
  peso_medio_kg: number | null
  medicamento: string | null
  dose: string | null
  observacoes: string | null
  fotos_urls: string[] | null
}

type PontoPeso = { data: string; label: string; peso: number; origem: 'entrada' | 'pesagem' }

const TIPO_EMOJI: Record<string, string> = {
  vacinacao:          '💉',
  pesagem:            '⚖️',
  tratamento:         '🩺',
  reproducao:         '🔬',
  parto:              '🐄',
  venda:              '💰',
  morte:              '❌',
  registro_fotografico: '📷',
  outro:              '📋',
}

function calcularIdade(dataNascimento: string): string {
  const nasc  = new Date(dataNascimento)
  const hoje  = new Date()
  const meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth())
  if (meses < 1)  return 'Recém-nascido'
  if (meses < 12) return `${meses} meses`
  const anos = Math.floor(meses / 12)
  const m    = meses % 12
  return m > 0 ? `${anos} anos e ${m} meses` : `${anos} anos`
}

function formatarData(data: string): string {
  return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
}

// ─── Gráfico de linha SVG puro ────────────────────────────────────────────────
function GraficoPeso({ pontos }: { pontos: PontoPeso[] }) {
  if (pontos.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-stone-400">
        Registre ao menos 2 pesagens para ver o gráfico
      </div>
    )
  }

  const W = 320; const H = 160
  const PAD = { top: 16, right: 16, bottom: 40, left: 44 }
  const gW = W - PAD.left - PAD.right
  const gH = H - PAD.top  - PAD.bottom

  const pesos  = pontos.map(p => p.peso)
  const minP   = Math.floor(Math.min(...pesos) * 0.95)
  const maxP   = Math.ceil (Math.max(...pesos) * 1.05)
  const rangeP = maxP - minP || 1

  const datas   = pontos.map(p => new Date(p.data + 'T00:00:00').getTime())
  const minD    = Math.min(...datas)
  const maxD    = Math.max(...datas)
  const rangeD  = maxD - minD || 1

  const cx = (i: number) => PAD.left + ((datas[i] - minD) / rangeD) * gW
  const cy = (p: number) => PAD.top  + (1 - (p - minP) / rangeP) * gH

  const pathD = pontos.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${cy(pt.peso).toFixed(1)}`).join(' ')

  // área sob a curva
  const areaD = `${pathD} L ${cx(pontos.length - 1).toFixed(1)} ${(PAD.top + gH).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + gH).toFixed(1)} Z`

  // guias horizontais
  const ticks = 4
  const guias = Array.from({ length: ticks + 1 }, (_, i) => minP + (rangeP / ticks) * i)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2D5016" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#2D5016" stopOpacity="0"/>
        </linearGradient>
      </defs>

      {/* Guias */}
      {guias.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={cy(v).toFixed(1)}
            x2={PAD.left + gW} y2={cy(v).toFixed(1)}
            stroke="#e7e5e4" strokeWidth="1"
          />
          <text
            x={PAD.left - 6} y={cy(v)}
            textAnchor="end" dominantBaseline="middle"
            fontSize="9" fill="#a8a29e"
          >{Math.round(v)}</text>
        </g>
      ))}

      {/* Área */}
      <path d={areaD} fill="url(#grad)"/>

      {/* Linha */}
      <path d={pathD} fill="none" stroke="#2D5016" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>

      {/* Pontos e labels de data */}
      {pontos.map((pt, i) => (
        <g key={i}>
          <circle
            cx={cx(i)} cy={cy(pt.peso)}
            r="4" fill="#fff" stroke="#2D5016" strokeWidth="2"
          />
          {/* tooltip peso */}
          <text
            x={cx(i)} y={cy(pt.peso) - 9}
            textAnchor="middle" fontSize="9" fill="#2D5016" fontWeight="600"
          >{pt.peso}kg</text>
          {/* data no eixo X — só primeiro e último para não poluir */}
          {(i === 0 || i === pontos.length - 1) && (
            <text
              x={cx(i)} y={H - 6}
              textAnchor={i === 0 ? 'start' : 'end'}
              fontSize="9" fill="#a8a29e"
            >{formatarData(pt.data)}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

// ─── Carrossel de fotos ───────────────────────────────────────────────────────
function CarrosselFotos({
  fotos,
  onExcluir,
}: {
  fotos: { url: string; data: string; descricao: string | null; eventoId: string }[]
  onExcluir: (url: string, eventoId: string) => Promise<void>
}) {
  const [idx, setIdx]         = useState(0)
  const [excluindo, setExcluindo] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  if (fotos.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-10 text-center">
        <p className="text-3xl mb-2">📷</p>
        <p className="text-sm text-stone-400">Nenhum registro fotográfico ainda.</p>
        <p className="text-xs text-stone-300 mt-1">Registre eventos do tipo "Registro fotográfico" no histórico.</p>
      </div>
    )
  }

  // Garante que idx não ultrapasse o limite após exclusão
  const idxSeguro = Math.min(idx, fotos.length - 1)
  const foto = fotos[idxSeguro]

  async function handleExcluir() {
    setExcluindo(true)
    await onExcluir(foto.url, foto.eventoId)
    setConfirmar(false)
    setExcluindo(false)
    // Recua o índice se era a última foto
    if (idxSeguro >= fotos.length - 1) setIdx(Math.max(0, fotos.length - 2))
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      {/* Imagem */}
      <div
        className="relative w-full bg-stone-100 cursor-pointer select-none"
        style={{ aspectRatio: '4/3' }}
        onClick={() => { setConfirmar(false); setIdx(i => (i + 1) % fotos.length) }}
      >
        <img
          src={foto.url}
          alt={foto.descricao ?? 'Foto do animal'}
          className="w-full h-full object-cover"
        />

        {/* Botão excluir */}
        <button
          onClick={e => { e.stopPropagation(); setConfirmar(v => !v) }}
          className="absolute top-3 right-3 bg-black/40 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center transition"
          title="Excluir foto"
        >
          🗑
        </button>

        {/* Indicador */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {fotos.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setIdx(i); setConfirmar(false) }}
              className={`w-1.5 h-1.5 rounded-full transition ${i === idxSeguro ? 'bg-white' : 'bg-white/50'}`}
            />
          ))}
        </div>

        {/* Seta direita */}
        {fotos.length > 1 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/30 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm pointer-events-none">
            ›
          </div>
        )}
      </div>

      {/* Confirmação de exclusão */}
      {confirmar && (
        <div className="bg-red-50 border-t border-red-200 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 font-medium">Excluir esta foto?</p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirmar(false)}
              className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleExcluir}
              disabled={excluindo}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-55"
            >
              {excluindo ? 'Excluindo…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* Legenda */}
      <div className="px-4 py-3 border-t border-stone-100">
        <p className="text-sm font-medium text-stone-700">{foto.descricao ?? '—'}</p>
        <p className="text-xs text-stone-400 mt-0.5">{formatarData(foto.data)} · {idxSeguro + 1} de {fotos.length}</p>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AnimalPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const id       = params.id as string

  const [animal,     setAnimal]     = useState<Animal | null>(null)
  const [eventos,    setEventos]    = useState<Evento[]>([])
  const [loading,    setLoading]    = useState(true)
  const [abaAtiva,   setAbaAtiva]   = useState<'perfil' | 'historico' | 'fotos'>('perfil')

  // edição
  const [editando,   setEditando]   = useState(false)
  const [salvandoEd, setSalvandoEd] = useState(false)
  const [erroEd,     setErroEd]     = useState<string | null>(null)
  const [form,       setForm]       = useState<Partial<Animal>>({})

  // novo evento
  const [novoEvento, setNovoEvento] = useState(false)
  const [tipoEvento, setTipoEvento] = useState('vacinacao')
  const [dataEvento, setDataEvento] = useState(new Date().toISOString().split('T')[0])
  const [descEvento, setDescEvento] = useState('')
  const [pesoEvento, setPesoEvento] = useState('')
  const [medEvento,  setMedEvento]  = useState('')
  const [doseEvento, setDoseEvento] = useState('')
  const [fotosEvento, setFotosEvento] = useState<File[]>([])
  const [salvando,   setSalvando]   = useState(false)
  const inputFotoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { carregarDados() }, [id])

  async function carregarDados() {
    const [animalRes, eventosRes] = await Promise.all([
      supabase.from('animais').select('*, lotes_animais(nome, especie)').eq('id', id).single(),
      supabase.from('eventos_manejo')
        .select('id, tipo, data, descricao, peso_medio_kg, medicamento, dose, observacoes, fotos_urls')
        .eq('animal_id', id)
        .is('deleted_at', null)
        .order('data', { ascending: false }),
    ])
    setAnimal(animalRes.data as any)
    setForm(animalRes.data as any)
    setEventos(eventosRes.data ?? [])
    setLoading(false)
  }

  // Dados derivados
  const eventosAsc     = [...eventos].reverse()
  const ultimaPesagem  = eventos.find(e => e.tipo === 'pesagem' && e.peso_medio_kg)
  const ultimaVacinacao = eventos.find(e => e.tipo === 'vacinacao')

  // Pontos para o gráfico: peso_entrada + pesagens em ordem cronológica
  const pontosPeso: PontoPeso[] = []
  if (animal?.peso_entrada_kg && animal?.data_nascimento) {
    pontosPeso.push({
      data:   animal.data_nascimento,
      label:  'Entrada',
      peso:   animal.peso_entrada_kg,
      origem: 'entrada',
    })
  }
  eventosAsc
    .filter(e => e.tipo === 'pesagem' && e.peso_medio_kg)
    .forEach(e => pontosPeso.push({
      data:   e.data,
      label:  formatarData(e.data),
      peso:   e.peso_medio_kg!,
      origem: 'pesagem',
    }))

  // Fotos de registros fotográficos
  const todasFotos = eventos
    .filter(e => e.tipo === 'registro_fotografico' && e.fotos_urls && e.fotos_urls.length > 0)
    .flatMap(e => (e.fotos_urls ?? []).map(url => ({ url, data: e.data, descricao: e.descricao, eventoId: e.id })))

  // ── Edição ──────────────────────────────────────────────────────────────────
  function abrirEdicao() {
    setForm({ ...animal })
    setEditando(true)
    setErroEd(null)
  }

  async function salvarEdicao() {
    setSalvandoEd(true)
    setErroEd(null)
    const { error } = await supabase.from('animais').update({
      nome:                form.nome                || null,
      brinco:              form.brinco              || null,
      sexo:                form.sexo,
      raca:                form.raca                || null,
      data_nascimento:     form.data_nascimento     || null,
      peso_entrada_kg:     form.peso_entrada_kg     || null,
      finalidade:          form.finalidade          || null,
      ultimo_cio:          form.ultimo_cio          || null,
      prenhez:             form.prenhez             || null,
      data_parto_previsto: form.data_parto_previsto || null,
      observacoes:         form.observacoes         || null,
      status:              form.status,
    }).eq('id', id)
    if (error) { setErroEd('Erro ao salvar. Tente novamente.'); setSalvandoEd(false); return }
    setSalvandoEd(false)
    setEditando(false)
    carregarDados()
  }

  // ── Novo evento ─────────────────────────────────────────────────────────────
  function handleFotosEvento(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setFotosEvento(prev => {
      const merged = [...prev, ...files]
      return merged.slice(0, 5)
    })
  }

  function removerFoto(i: number) {
    setFotosEvento(prev => prev.filter((_, idx) => idx !== i))
  }

  async function salvarEvento() {
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: faz } = await supabase.from('fazendas').select('id').eq('owner_id', user.id).single()
    if (!faz) return

    // Upload de fotos se houver
    let fotos_urls: string[] = []
    if (tipoEvento === 'registro_fotografico' && fotosEvento.length > 0) {
      for (const file of fotosEvento) {
        const ext    = file.name.split('.').pop()
        const path   = `eventos/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('animais').upload(path, file, { upsert: true })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('animais').getPublicUrl(path)
          fotos_urls.push(urlData.publicUrl)
        }
      }
    }

    await supabase.from('eventos_manejo').insert({
      fazenda_id:    faz.id,
      animal_id:     id,
      tipo:          tipoEvento,
      data:          dataEvento,
      descricao:     descEvento || null,
      peso_medio_kg: pesoEvento ? Number(pesoEvento) : null,
      medicamento:   medEvento  || null,
      dose:          doseEvento || null,
      fotos_urls:    fotos_urls.length > 0 ? fotos_urls : null,
    })

    // Atualiza foto de perfil do animal com a última foto adicionada
    if (tipoEvento === 'registro_fotografico' && fotos_urls.length > 0) {
      await supabase.from('animais')
        .update({ foto_url: fotos_urls[fotos_urls.length - 1] })
        .eq('id', id)
    }

    setNovoEvento(false)
    setDescEvento('')
    setPesoEvento('')
    setMedEvento('')
    setDoseEvento('')
    setFotosEvento([])
    setSalvando(false)
    carregarDados()
  }

  // ── Excluir foto ────────────────────────────────────────────────────────────
  async function excluirFoto(url: string, eventoId: string) {
    // 1. Remove do Storage — extrai o path após o bucket
    const path = url.split('/animais/')[1]
    if (path) await supabase.storage.from('animais').remove([decodeURIComponent(path)])

    // 2. Atualiza fotos_urls do evento removendo a URL
    const evento = eventos.find(e => e.id === eventoId)
    if (!evento) return
    const novasUrls = (evento.fotos_urls ?? []).filter(u => u !== url)
    await supabase.from('eventos_manejo')
      .update({ fotos_urls: novasUrls.length > 0 ? novasUrls : null })
      .eq('id', eventoId)

    // 3. Se era a foto de perfil, regride para a anterior ou nula
    if (animal?.foto_url === url) {
      const proxima = todasFotos.find(f => f.url !== url)?.url ?? null
      await supabase.from('animais').update({ foto_url: proxima }).eq('id', id)
    }

    carregarDados()
  }
  if (loading) return (
    <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center">
      <p className="text-sm text-stone-500">Carregando...</p>
    </div>
  )

  if (!animal) return (
    <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center">
      <p className="text-sm text-stone-500">Animal não encontrado.</p>
    </div>
  )

  const prenhez = animal.prenhez === 'positivo' ? '✅ Positivo'
    : animal.prenhez === 'negativo' ? '❌ Negativo'
    : animal.prenhez === 'aguardando' ? '⏳ Aguardando' : null

  const inputCls = 'w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-[#2D5016]/25 focus:border-[#2D5016] bg-white'

  // Formulário de novo evento (usado nas duas abas)
  const FormNovoEvento = novoEvento ? (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
      <p className="text-sm font-semibold text-stone-700">Novo evento</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-stone-600">Tipo</label>
          <select value={tipoEvento} onChange={e => setTipoEvento(e.target.value)}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white">
            <option value="vacinacao">💉 Vacinação</option>
            <option value="pesagem">⚖️ Pesagem</option>
            <option value="tratamento">🩺 Tratamento</option>
            <option value="reproducao">🔬 Reprodução</option>
            <option value="parto">🐄 Parto</option>
            <option value="registro_fotografico">📷 Registro fotográfico</option>
            <option value="outro">📋 Outro</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-stone-600">Data</label>
          <input type="date" value={dataEvento} onChange={e => setDataEvento(e.target.value)}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"/>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-stone-600">
          {{
            vacinacao:            'Descrição',
            pesagem:              'Observações da pesagem',
            tratamento:           'Descrição do tratamento',
            reproducao:           'Descrição',
            parto:                'Descrição do parto',
            registro_fotografico: 'Descrição do momento',
            outro:                'Descrição',
          }[tipoEvento] ?? 'Descrição'}
        </label>
        <input type="text"
          placeholder={{
            vacinacao:            'Ex: Vacina febre aftosa, Brucelose…',
            pesagem:              'Ex: Pesagem mensal, Pré-venda…',
            tratamento:           'Ex: Tratamento carrapato, Vermifugação…',
            reproducao:           'Ex: Inseminação artificial, Monta natural…',
            parto:                'Ex: Parto normal, Gemelar, Assistido…',
            registro_fotografico: 'Ex: Primeiro cio, Desmame, 1 ano de vida…',
            outro:                'Descreva o evento…',
          }[tipoEvento] ?? 'Descrição'}
          value={descEvento} onChange={e => setDescEvento(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"/>
      </div>

      {tipoEvento === 'pesagem' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-stone-600">Data da pesagem</label>
            <input type="date" value={dataEvento} onChange={e => setDataEvento(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-stone-600">Peso (kg)</label>
            <input type="number" step="0.1" placeholder="Ex: 420" value={pesoEvento} onChange={e => setPesoEvento(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"/>
          </div>
        </div>
      )}

      {(tipoEvento === 'vacinacao' || tipoEvento === 'tratamento') && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-stone-600">Medicamento</label>
            <input type="text" placeholder="Nome do produto" value={medEvento} onChange={e => setMedEvento(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-stone-600">Dose</label>
            <input type="text" placeholder="Ex: 2ml" value={doseEvento} onChange={e => setDoseEvento(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"/>
          </div>
        </div>
      )}

      {tipoEvento === 'registro_fotografico' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-stone-600">Foto</label>
            <span className="text-xs text-stone-400">{fotosEvento.length} foto{fotosEvento.length !== 1 ? 's' : ''} adicionada{fotosEvento.length !== 1 ? 's' : ''}</span>
          </div>
          {fotosEvento.length < 1 && (
            <label className="cursor-pointer flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-300 py-3 text-sm text-stone-500 hover:border-[#2D5016] hover:text-[#2D5016] transition">
              📷 Selecionar foto
              <input
                ref={inputFotoRef}
                type="file" accept="image/*" className="hidden"
                onChange={handleFotosEvento}
              />
            </label>
          )}
          {fotosEvento.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {fotosEvento.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-stone-100">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover"/>
                  <button
                    onClick={() => removerFoto(i)}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none"
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-stone-400">
            Use para acompanhar o crescimento, desenvolvimento e principais momentos do animal ao longo da vida.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => { setNovoEvento(false); setFotosEvento([]) }}
          className="flex-1 rounded-lg border border-stone-300 text-stone-600 text-sm py-2.5 hover:bg-stone-50 transition">
          Cancelar
        </button>
        <button onClick={salvarEvento} disabled={salvando}
          className="flex-1 rounded-lg bg-[#2D5016] text-white text-sm py-2.5 hover:bg-[#3a6620] transition disabled:opacity-55">
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  ) : null

  return (
    <div className="min-h-screen bg-[#F5F2EB]">

      <header className="bg-[#2D5016] px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/70 hover:text-white transition">←</button>
          <div>
            <p className="text-white font-semibold text-sm leading-none">
              {animal.nome ?? animal.brinco ?? 'Perfil do animal'}
            </p>
            <p className="text-white/60 text-xs mt-0.5">Pecuária</p>
          </div>
        </div>
        <button onClick={abrirEdicao}
          className="bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition">
          ✏️ Editar
        </button>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* Card identificação */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-amber-50 overflow-hidden shrink-0 relative">
            {animal.foto_url
              ? <img src={animal.foto_url} alt={animal.nome ?? 'Animal'} className="w-full h-full object-cover"/>
              : <div className="w-full h-full flex items-center justify-center">
                  <span className="text-4xl">{animal.sexo === 'M' ? '🐂' : '🐄'}</span>
                </div>
            }
            <span className={`absolute bottom-1 right-1 text-xs font-bold px-1 py-0.5 rounded-full
              ${animal.sexo === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
              {animal.sexo === 'M' ? '♂' : '♀'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-stone-900 leading-tight truncate">{animal.nome ?? '—'}</h1>
            {animal.brinco && <p className="text-sm text-stone-400 mt-0.5">Brinco #{animal.brinco}</p>}
            <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full
              ${animal.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
              {animal.status}
            </span>
          </div>
        </div>

        {/* Modal edição */}
        {editando && (
          <div className="bg-white rounded-2xl border border-amber-300 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-700">✏️ Editar animal</p>
              <button onClick={() => setEditando(false)} className="text-stone-400 hover:text-stone-600 text-lg">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-stone-600">Nome</label>
                <input type="text" className={inputCls} value={form.nome ?? ''} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}/>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-stone-600">Brinco / Nº</label>
                <input type="text" className={inputCls} value={form.brinco ?? ''} onChange={e => setForm(f => ({ ...f, brinco: e.target.value }))}/>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-600">Sexo</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ v: 'F', l: '🐄 Fêmea' }, { v: 'M', l: '🐂 Macho' }].map(({ v, l }) => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, sexo: v }))}
                    className={`rounded-lg border-2 py-2 text-sm font-medium transition
                      ${form.sexo === v ? 'border-[#2D5016] bg-[#2D5016]/5 text-[#2D5016]' : 'border-stone-200 text-stone-500'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-600">Raça</label>
              <input type="text" className={inputCls} value={form.raca ?? ''} onChange={e => setForm(f => ({ ...f, raca: e.target.value }))}/>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-600">Finalidade</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'corte',         l: '🥩 Corte' },
                  { v: 'leite',         l: '🥛 Leite' },
                  { v: 'dupla_aptidao', l: '⚡ Dupla aptidão' },
                ].map(({ v, l }) => (
                  <button key={v} type="button"
                    onClick={() => setForm(f => ({ ...f, finalidade: v as Animal['finalidade'] }))}
                    className={`rounded-lg border-2 py-2 text-xs font-medium transition
                      ${form.finalidade === v ? 'border-[#2D5016] bg-[#2D5016]/5 text-[#2D5016]' : 'border-stone-200 text-stone-500'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-stone-600">Nascimento</label>
                <input type="date" className={inputCls} value={form.data_nascimento ?? ''} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))}/>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-stone-600">Peso entrada (kg)</label>
                <input type="number" step="0.1" className={inputCls} value={form.peso_entrada_kg ?? ''} onChange={e => setForm(f => ({ ...f, peso_entrada_kg: Number(e.target.value) }))}/>
              </div>
            </div>
            {form.sexo === 'F' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-stone-600">Último cio</label>
                  <input type="date" className={inputCls} value={form.ultimo_cio ?? ''} onChange={e => setForm(f => ({ ...f, ultimo_cio: e.target.value }))}/>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-stone-600">Prenhez</label>
                  <select className={inputCls} value={form.prenhez ?? ''} onChange={e => setForm(f => ({ ...f, prenhez: e.target.value }))}>
                    <option value="">Não informado</option>
                    <option value="positivo">Positivo ✅</option>
                    <option value="negativo">Negativo ❌</option>
                    <option value="aguardando">Aguardando diagnóstico</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-stone-600">Previsão de parto</label>
                  <input type="date" className={inputCls} value={form.data_parto_previsto ?? ''} onChange={e => setForm(f => ({ ...f, data_parto_previsto: e.target.value }))}/>
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-600">Status</label>
              <select className={inputCls} value={form.status ?? 'ativo'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="ativo">Ativo</option>
                <option value="vendido">Vendido</option>
                <option value="morto">Morto</option>
                <option value="transferido">Transferido</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-600">Observações</label>
              <textarea rows={2} className={inputCls + ' resize-none'} value={form.observacoes ?? ''} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}/>
            </div>
            {erroEd && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{erroEd}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditando(false)}
                className="flex-1 rounded-lg border border-stone-300 text-stone-600 text-sm py-2.5 hover:bg-stone-50 transition">
                Cancelar
              </button>
              <button onClick={salvarEdicao} disabled={salvandoEd}
                className="flex-1 rounded-lg bg-[#2D5016] text-white text-sm py-2.5 hover:bg-[#3a6620] transition disabled:opacity-55">
                {salvandoEd ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}

        {/* Abas */}
        <div className="bg-white rounded-xl border border-stone-200 flex overflow-hidden">
          {([
            { key: 'perfil',    label: '📋 Perfil' },
            { key: 'historico', label: `📅 Histórico (${eventos.length})` },
            { key: 'fotos',     label: `📷 Fotos (${todasFotos.length})` },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setAbaAtiva(key)}
              className={`flex-1 py-3 text-xs font-medium transition
                ${abaAtiva === key ? 'text-[#2D5016] border-b-2 border-[#2D5016] bg-[#2D5016]/5' : 'text-stone-400 hover:text-stone-600'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── ABA PERFIL ── */}
        {abaAtiva === 'perfil' && (
          <div className="space-y-4">

            {/* Botão registrar evento no topo */}
            <button onClick={() => { setNovoEvento(v => !v); setAbaAtiva('perfil') }}
              className="w-full rounded-xl bg-[#2D5016] text-white text-sm font-medium py-3 hover:bg-[#3a6620] transition">
              + Registrar evento
            </button>
            {FormNovoEvento}

            {/* Dados gerais */}
            <section className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
              <div className="px-5 py-3 bg-stone-50 rounded-t-2xl">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Dados gerais</p>
              </div>
              {animal.raca && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Raça</p>
                  <p className="text-sm font-medium text-stone-800">{animal.raca}</p>
                </div>
              )}
              {animal.finalidade && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Finalidade</p>
                  <p className="text-sm font-medium text-stone-800">
                    {{ corte: '🥩 Corte', leite: '🥛 Leite', dupla_aptidao: '⚡ Dupla aptidão' }[animal.finalidade]}
                  </p>
                </div>
              )}
              {animal.data_nascimento && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Nascimento</p>
                  <p className="text-sm font-medium text-stone-800">{formatarData(animal.data_nascimento)}</p>
                </div>
              )}
              {animal.data_nascimento && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Idade atual</p>
                  <p className="text-sm font-semibold text-amber-600">{calcularIdade(animal.data_nascimento)}</p>
                </div>
              )}
              <div className="flex justify-between items-center px-5 py-3.5">
                <p className="text-sm text-stone-500">Peso atual</p>
                {ultimaPesagem ? (
                  <div className="text-right">
                    <p className="text-sm font-semibold text-stone-800">{ultimaPesagem.peso_medio_kg} kg</p>
                    <p className="text-xs text-stone-400">{formatarData(ultimaPesagem.data)}</p>
                  </div>
                ) : (
                  <div className="text-right">
                    <p className="text-sm font-medium text-stone-800">
                      {animal.peso_entrada_kg ? `${animal.peso_entrada_kg} kg` : '—'}
                    </p>
                    {animal.peso_entrada_kg && <p className="text-xs text-stone-400">peso de entrada</p>}
                  </div>
                )}
              </div>
              {animal.lotes_animais && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Lote</p>
                  <p className="text-sm font-medium text-stone-800">{animal.lotes_animais.nome}</p>
                </div>
              )}
              {animal.sisbov && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">SISBOV</p>
                  <p className="text-sm font-medium text-stone-800">{animal.sisbov}</p>
                </div>
              )}
              <div className="flex justify-between items-center px-5 py-3.5">
                <p className="text-sm text-stone-500">Última vacinação</p>
                {ultimaVacinacao ? (
                  <div className="text-right">
                    <p className="text-sm font-medium text-stone-800">{ultimaVacinacao.descricao ?? '—'}</p>
                    <p className="text-xs text-stone-400">{formatarData(ultimaVacinacao.data)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-stone-400">Não registrada</p>
                )}
              </div>
            </section>

            {/* Reprodução */}
            {animal.sexo === 'F' && (
              <section className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
                <div className="px-5 py-3 bg-stone-50 rounded-t-2xl">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">🔬 Reprodução</p>
                </div>
                {animal.ultimo_cio && (
                  <div className="flex justify-between items-center px-5 py-3.5">
                    <p className="text-sm text-stone-500">Último cio</p>
                    <p className="text-sm font-medium text-stone-800">{formatarData(animal.ultimo_cio)}</p>
                  </div>
                )}
                {prenhez && (
                  <div className="flex justify-between items-center px-5 py-3.5">
                    <p className="text-sm text-stone-500">Prenhez</p>
                    <p className="text-sm font-medium text-stone-800">{prenhez}</p>
                  </div>
                )}
                {animal.data_parto_previsto && (
                  <div className="flex justify-between items-center px-5 py-3.5">
                    <p className="text-sm text-stone-500">Previsão de parto</p>
                    <p className="text-sm font-semibold text-amber-600">{formatarData(animal.data_parto_previsto)}</p>
                  </div>
                )}
                {!animal.ultimo_cio && !prenhez && !animal.data_parto_previsto && (
                  <p className="px-5 py-4 text-sm text-stone-400">Nenhum dado reprodutivo registrado.</p>
                )}
              </section>
            )}

            {/* Gráfico de evolução de peso */}
            <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">⚖️ Evolução de peso</p>
                {pontosPeso.length >= 2 && (
                  <p className="text-xs text-stone-400">
                    {pontosPeso.length} registro{pontosPeso.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <div className="px-4 py-3">
                <GraficoPeso pontos={pontosPeso} />
              </div>
              {pontosPeso.length >= 2 && (
                <div className="px-5 pb-4 grid grid-cols-3 gap-3 border-t border-stone-100 pt-3">
                  <div className="text-center">
                    <p className="text-xs text-stone-400">Entrada</p>
                    <p className="text-sm font-semibold text-stone-700">{pontosPeso[0].peso} kg</p>
                  </div>
                  <div className="text-center border-x border-stone-100">
                    <p className="text-xs text-stone-400">Atual</p>
                    <p className="text-sm font-semibold text-stone-700">{pontosPeso[pontosPeso.length - 1].peso} kg</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-stone-400">Ganho</p>
                    <p className={`text-sm font-semibold ${pontosPeso[pontosPeso.length - 1].peso - pontosPeso[0].peso >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {pontosPeso[pontosPeso.length - 1].peso - pontosPeso[0].peso >= 0 ? '+' : ''}
                      {(pontosPeso[pontosPeso.length - 1].peso - pontosPeso[0].peso).toFixed(1)} kg
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Observações */}
            {animal.observacoes && (
              <section className="bg-white rounded-2xl border border-stone-200 p-5">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">📝 Observações</p>
                <p className="text-sm text-stone-600 leading-relaxed">{animal.observacoes}</p>
              </section>
            )}
          </div>
        )}

        {/* ── ABA HISTÓRICO ── */}
        {abaAtiva === 'historico' && (
          <div className="space-y-4">
            <button onClick={() => setNovoEvento(v => !v)}
              className="w-full rounded-xl bg-[#2D5016] text-white text-sm font-medium py-3 hover:bg-[#3a6620] transition">
              + Registrar evento
            </button>
            {FormNovoEvento}

            {eventos.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-stone-300 p-8 text-center">
                <p className="text-sm text-stone-400">Nenhum evento registrado ainda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {eventos.map(ev => (
                  <div key={ev.id} className="bg-white rounded-xl border border-stone-200 px-4 py-3.5 flex gap-3">
                    <span className="text-xl mt-0.5">{TIPO_EMOJI[ev.tipo] ?? '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-stone-800 capitalize">
                          {ev.tipo === 'registro_fotografico' ? 'Registro fotográfico' : ev.tipo}
                        </p>
                        <p className="text-xs text-stone-400 shrink-0">{formatarData(ev.data)}</p>
                      </div>
                      {ev.descricao && <p className="text-sm text-stone-500 mt-0.5">{ev.descricao}</p>}
                      {ev.peso_medio_kg && <p className="text-xs text-amber-600 mt-0.5 font-medium">⚖️ {ev.peso_medio_kg} kg</p>}
                      {ev.medicamento && (
                        <p className="text-xs text-stone-500 mt-0.5">
                          💊 {ev.medicamento}{ev.dose ? ` — ${ev.dose}` : ''}
                        </p>
                      )}
                      {ev.fotos_urls && ev.fotos_urls.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {ev.fotos_urls.map((url, i) => (
                            <img key={i} src={url} alt="" className="w-12 h-12 rounded-lg object-cover border border-stone-200"/>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ABA FOTOS ── */}
        {abaAtiva === 'fotos' && (
          <div className="space-y-4">
            <CarrosselFotos fotos={todasFotos} onExcluir={excluirFoto} />
          </div>
        )}

      </main>
    </div>
  )
}