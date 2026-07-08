'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Animal = {
  id: string
  nome: string | null
  brinco: string | null
  sexo: string | null
  raca: string | null
  data_nascimento: string | null
  foto_url: string | null
  status: string
  finalidade: 'corte' | 'leite' | 'dupla_aptidao' | null
  data_parto_previsto: string | null
  prenhez: string | null
  lotes_animais: { nome: string; especie: string } | null
}

type Indicadores = {
  totalAnimais:   number
  partosProximos: { id: string; nome: string | null; brinco: string | null; data: string }[]
  temCorte:       boolean
  gmdMedioCorte:  number | null
  temLeite:       boolean
  taxaPrenhez:    number | null
  iepMedio:       number | null
  vacasLactacao:  number
}

function calcularIdade(dataNascimento: string): string {
  const nasc  = new Date(dataNascimento)
  const hoje  = new Date()
  const meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth())
  if (meses < 1)  return 'Recém-nascido'
  if (meses < 12) return `${meses}m`
  const anos = Math.floor(meses / 12)
  const m    = meses % 12
  return m > 0 ? `${anos}a ${m}m` : `${anos} anos`
}

function formatarData(data: string): string {
  return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function PecuariaPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [animais,     setAnimais]     = useState<Animal[]>([])
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [busca,       setBusca]       = useState('')
  const [filtroSexo,  setFiltroSexo]  = useState<'todos' | 'M' | 'F'>('todos')

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: faz } = await supabase.from('fazendas').select('id').eq('owner_id', user.id).single()
    if (!faz) { router.push('/onboarding'); return }

    const [animaisRes, eventosRes] = await Promise.all([
      supabase.from('animais')
        .select('id, nome, brinco, sexo, raca, data_nascimento, foto_url, status, finalidade, data_parto_previsto, prenhez, lotes_animais(nome, especie)')
        .eq('fazenda_id', faz.id).eq('status', 'ativo').is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase.from('eventos_manejo')
        .select('animal_id, data, peso_medio_kg, tipo')
        .eq('fazenda_id', faz.id).in('tipo', ['pesagem', 'parto']).is('deleted_at', null)
        .order('data', { ascending: true }),
    ])

    const animaisData = (animaisRes.data as any[]) ?? []
    const eventosData = eventosRes.data ?? []
    setAnimais(animaisData)

    const hoje    = new Date()
    const em7dias = new Date(); em7dias.setDate(hoje.getDate() + 7)
    const hojeStr = hoje.toISOString().split('T')[0]
    const em7Str  = em7dias.toISOString().split('T')[0]

    const partosProximos = animaisData
      .filter(a => a.data_parto_previsto && a.data_parto_previsto >= hojeStr && a.data_parto_previsto <= em7Str)
      .map(a => ({ id: a.id, nome: a.nome, brinco: a.brinco, data: a.data_parto_previsto }))
      .sort((a: any, b: any) => a.data.localeCompare(b.data))

    const temCorte = animaisData.some(a => a.finalidade === 'corte' || a.finalidade === 'dupla_aptidao')
    const temLeite = animaisData.some(a => a.finalidade === 'leite' || a.finalidade === 'dupla_aptidao')

    let gmdMedioCorte: number | null = null
    if (temCorte) {
      const gmds: number[] = []
      for (const a of animaisData.filter(a => a.finalidade === 'corte' || a.finalidade === 'dupla_aptidao')) {
        const ps = eventosData.filter(e => e.animal_id === a.id && e.tipo === 'pesagem' && e.peso_medio_kg).slice(-2)
        if (ps.length === 2) {
          const dias = (new Date(ps[1].data).getTime() - new Date(ps[0].data).getTime()) / 86400000
          if (dias > 0) { const g = (ps[1].peso_medio_kg - ps[0].peso_medio_kg) / dias; if (g > 0) gmds.push(g) }
        }
      }
      gmdMedioCorte = gmds.length > 0 ? gmds.reduce((s, v) => s + v, 0) / gmds.length : null
    }

    let taxaPrenhez: number | null = null, iepMedio: number | null = null, vacasLactacao = 0
    if (temLeite) {
      const femeas = animaisData.filter(a => (a.finalidade === 'leite' || a.finalidade === 'dupla_aptidao') && a.sexo === 'F')
      taxaPrenhez = femeas.length > 0 ? Math.round((femeas.filter(a => a.prenhez === 'positivo').length / femeas.length) * 100) : null
      const h305 = new Date(); h305.setDate(hoje.getDate() - 305)
      const h305Str = h305.toISOString().split('T')[0]
      const partosRec = new Set(eventosData.filter(e => e.tipo === 'parto' && e.data >= h305Str).map(e => e.animal_id))
      vacasLactacao = femeas.filter(a => partosRec.has(a.id)).length
      const ieps: number[] = []
      for (const a of femeas) {
        const ps = eventosData.filter(e => e.animal_id === a.id && e.tipo === 'parto').map(e => e.data).sort()
        for (let i = 1; i < ps.length; i++) {
          const d = (new Date(ps[i]).getTime() - new Date(ps[i-1]).getTime()) / 86400000
          if (d > 0) ieps.push(d)
        }
      }
      iepMedio = ieps.length > 0 ? Math.round(ieps.reduce((s, v) => s + v, 0) / ieps.length) : null
    }

    setIndicadores({ totalAnimais: animaisData.length, partosProximos, temCorte, gmdMedioCorte, temLeite, taxaPrenhez, iepMedio, vacasLactacao })
    setLoading(false)
  }

  const animaisFiltrados = animais.filter(a => {
    const termo = busca.toLowerCase()
    const bate  = !busca || a.nome?.toLowerCase().includes(termo) || a.brinco?.toLowerCase().includes(termo) || a.raca?.toLowerCase().includes(termo)
    return bate && (filtroSexo === 'todos' || a.sexo === filtroSexo)
  })

  if (loading) return (
    <div className="min-h-screen bg-[#F0EDE6] flex items-center justify-center">
      <p className="text-sm text-stone-400 font-medium">Carregando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F0EDE6]">

      {/* ── Header ── */}
      <header className="bg-[#2D5016] px-4 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')}
            className="text-white/60 hover:text-white transition text-lg leading-none">←</button>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Pecuária</p>
            <p className="text-white/50 text-[11px] leading-tight">{animais.length} animais cadastrados</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/dashboard/pecuaria/novo')}
          className="bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition border border-white/20"
        >
          + Novo animal
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* ── Indicadores do rebanho ── */}
        {indicadores && indicadores.totalAnimais > 0 && (
          <section className="bg-[#FAFAF8] rounded-2xl border border-[#E5E0D8] overflow-hidden">
            <div className="h-[3px] bg-gradient-to-r from-[#2D5016] to-[#5A8A30]"/>
            <div className="px-4 py-4">
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-3">
                Indicadores do rebanho
              </p>

              {/* Comuns */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-[#F0EDE6] rounded-xl p-3">
                  <p className="text-2xl font-bold text-[#1C2B0E] leading-none">{indicadores.totalAnimais}</p>
                  <p className="text-[10px] font-medium text-stone-400 mt-1.5 uppercase tracking-wide">Animais ativos</p>
                </div>
                <button
                  onClick={() => { const el = document.getElementById('partos-proximos'); el?.scrollIntoView({ behavior: 'smooth' }) }}
                  className={`rounded-xl p-3 text-left transition ${indicadores.partosProximos.length > 0 ? 'bg-[#FEF3C7] hover:bg-[#fde68a]' : 'bg-[#F0EDE6]'}`}
                >
                  <p className={`text-2xl font-bold leading-none ${indicadores.partosProximos.length > 0 ? 'text-[#D97706]' : 'text-[#1C2B0E]'}`}>
                    {indicadores.partosProximos.length}
                  </p>
                  <p className="text-[10px] font-medium text-stone-400 mt-1.5 uppercase tracking-wide">Partos em 7 dias</p>
                </button>
              </div>

              {/* Corte */}
              {indicadores.temCorte && (
                <div className="border-t border-[#E5E0D8] pt-3 mb-3">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">🥩 Corte</p>
                  <div className="bg-[#F0EDE6] rounded-xl p-3">
                    <p className="text-xl font-bold text-[#1C2B0E] leading-none">
                      {indicadores.gmdMedioCorte !== null ? `${indicadores.gmdMedioCorte.toFixed(2)} kg/dia` : '—'}
                    </p>
                    <p className="text-[10px] font-medium text-stone-400 mt-1.5 uppercase tracking-wide">GMD médio do rebanho</p>
                    {indicadores.gmdMedioCorte === null && (
                      <p className="text-[10px] text-stone-400 mt-1">Registre ao menos 2 pesagens por animal</p>
                    )}
                  </div>
                </div>
              )}

              {/* Leite */}
              {indicadores.temLeite && (
                <div className="border-t border-[#E5E0D8] pt-3 mb-3">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">🥛 Leite</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: indicadores.taxaPrenhez !== null ? `${indicadores.taxaPrenhez}%` : '—', l: 'Taxa prenhez' },
                      { v: indicadores.iepMedio !== null ? `${indicadores.iepMedio}d` : '—', l: 'IEP médio' },
                      { v: indicadores.vacasLactacao, l: 'Em lactação' },
                    ].map(({ v, l }) => (
                      <div key={l} className="bg-[#F0EDE6] rounded-xl p-3">
                        <p className="text-lg font-bold text-[#1C2B0E] leading-none">{v}</p>
                        <p className="text-[10px] font-medium text-stone-400 mt-1.5 uppercase tracking-wide leading-tight">{l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Partos próximos */}
              {indicadores.partosProximos.length > 0 && (
                <div id="partos-proximos" className="border-t border-[#E5E0D8] pt-3">
                  <p className="text-[10px] font-semibold text-[#D97706] uppercase tracking-widest mb-2">🐄 Partos previstos — próximos 7 dias</p>
                  <div className="space-y-1.5">
                    {indicadores.partosProximos.map(p => (
                      <button key={p.id} onClick={() => router.push(`/dashboard/pecuaria/${p.id}`)}
                        className="w-full flex items-center justify-between bg-[#FEF3C7] rounded-xl px-3 py-2.5
                          hover:bg-[#fde68a] transition border border-[#D97706]/20">
                        <p className="text-sm font-semibold text-[#1C2B0E]">
                          {p.nome ?? p.brinco ?? 'Animal'}
                          {p.brinco && p.nome && <span className="text-stone-400 font-normal"> · #{p.brinco}</span>}
                        </p>
                        <p className="text-xs text-[#D97706] font-bold">{formatarData(p.data)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Busca e filtros ── */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Buscar por nome, brinco ou raça..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full rounded-xl border border-[#E5E0D8] pl-9 pr-4 py-2.5 text-sm
                text-[#1C2B0E] placeholder:text-stone-400 outline-none bg-[#FAFAF8]
                focus:ring-2 focus:ring-[#2D5016]/20 focus:border-[#2D5016]"
            />
          </div>
          <select
            value={filtroSexo}
            onChange={e => setFiltroSexo(e.target.value as any)}
            className="rounded-xl border border-[#E5E0D8] px-3 py-2.5 text-sm font-medium
              text-[#1C2B0E] outline-none bg-[#FAFAF8]
              focus:ring-2 focus:ring-[#2D5016]/20 focus:border-[#2D5016]"
          >
            <option value="todos">Todos</option>
            <option value="M">Machos</option>
            <option value="F">Fêmeas</option>
          </select>
        </div>

        {/* ── Estado vazio ── */}
        {animais.length === 0 && (
          <div className="bg-[#FAFAF8] rounded-2xl border border-dashed border-[#E5E0D8] p-10 text-center">
            <p className="text-4xl mb-3">🐄</p>
            <h2 className="text-base font-semibold text-[#1C2B0E] mb-1">Nenhum animal cadastrado</h2>
            <p className="text-sm text-stone-400 mb-5">Cadastre o primeiro animal da sua propriedade</p>
            <button onClick={() => router.push('/dashboard/pecuaria/novo')}
              className="bg-[#2D5016] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#3D6B1F] transition">
              + Cadastrar primeiro animal
            </button>
          </div>
        )}

        {/* ── Lista de animais ── */}
        {animaisFiltrados.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {animaisFiltrados.map(animal => (
              <button
                key={animal.id}
                onClick={() => router.push(`/dashboard/pecuaria/${animal.id}`)}
                className="bg-[#FAFAF8] rounded-2xl border border-[#E5E0D8] overflow-hidden
                  text-left hover:shadow-md hover:border-[#2D5016]/30 transition active:scale-[.99]
                  flex items-center gap-3 p-3"
              >
                {/* Foto */}
                <div className="w-[68px] h-[68px] rounded-xl bg-[#EBF2E3] overflow-hidden shrink-0 relative">
                  {animal.foto_url ? (
                    <img src={animal.foto_url} alt={animal.nome ?? 'Animal'} className="w-full h-full object-cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl">{animal.sexo === 'M' ? '🐂' : '🐄'}</span>
                    </div>
                  )}
                  {/* Badge sexo */}
                  <span className={`absolute bottom-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded-full
                    ${animal.sexo === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                    {animal.sexo === 'M' ? '♂' : '♀'}
                  </span>
                </div>

                {/* Dados */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1C2B0E] truncate leading-tight">
                        {animal.nome ?? animal.brinco ?? '—'}
                      </p>
                      {animal.brinco && animal.nome && (
                        <p className="text-[11px] text-stone-400 leading-tight">#{animal.brinco}</p>
                      )}
                    </div>
                    {/* Finalidade badge */}
                    {animal.finalidade && (
                      <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full
                        ${ animal.finalidade === 'corte' ? 'bg-[#FEF3C7] text-[#92400E]'
                          : animal.finalidade === 'leite' ? 'bg-blue-50 text-blue-700'
                          : 'bg-purple-50 text-purple-700'}`}>
                        {animal.finalidade === 'corte' ? '🥩' : animal.finalidade === 'leite' ? '🥛' : '⚡'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {animal.raca && (
                      <span className="text-[11px] text-stone-500">{animal.raca}</span>
                    )}
                    {animal.raca && animal.data_nascimento && (
                      <span className="text-stone-300 text-[10px]">·</span>
                    )}
                    {animal.data_nascimento && (
                      <span className="text-[11px] font-semibold text-[#D97706]">
                        {calcularIdade(animal.data_nascimento)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full
                      ${animal.status === 'ativo' ? 'bg-[#EBF2E3] text-[#2D5016]' : 'bg-stone-100 text-stone-500'}`}>
                      {animal.status}
                    </span>
                    {animal.prenhez === 'positivo' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-50 text-pink-700">
                        gestante
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-stone-300 text-lg shrink-0">›</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Sem resultados ── */}
        {animais.length > 0 && animaisFiltrados.length === 0 && (
          <div className="bg-[#FAFAF8] rounded-xl border border-[#E5E0D8] p-8 text-center">
            <p className="text-sm text-stone-400">Nenhum animal encontrado para "{busca}"</p>
          </div>
        )}

      </main>
    </div>
  )
}