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
  totalAnimais:    number
  partosProximos:  { id: string; nome: string | null; brinco: string | null; data: string }[]
  // corte
  temCorte:        boolean
  gmdMedioCorte:   number | null
  // leite
  temLeite:        boolean
  taxaPrenhez:     number | null
  iepMedio:        number | null
  vacasLactacao:   number
}

const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="24" fill="rgba(255,255,255,0.15)"/>
    <line x1="18" y1="36" x2="28" y2="12" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="22" cy="26" r="2.5" fill="#fff"/>
    <circle cx="20" cy="21" r="2.5" fill="#fff"/>
    <circle cx="25" cy="17" r="2.5" fill="#fff"/>
    <line x1="30" y1="36" x2="20" y2="12" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="26" cy="26" r="2.5" fill="#fff"/>
    <circle cx="28" cy="21" r="2.5" fill="#fff"/>
    <circle cx="23" cy="17" r="2.5" fill="#fff"/>
  </svg>
)

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

  const [animais,      setAnimais]      = useState<Animal[]>([])
  const [indicadores,  setIndicadores]  = useState<Indicadores | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [busca,        setBusca]        = useState('')
  const [filtroSexo,   setFiltroSexo]   = useState<'todos' | 'M' | 'F'>('todos')
  const [fazendaId,    setFazendaId]    = useState<string | null>(null)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: faz } = await supabase
      .from('fazendas').select('id')
      .eq('owner_id', user.id).single()
    if (!faz) { router.push('/onboarding'); return }

    setFazendaId(faz.id)

    // Busca animais e eventos de pesagem em paralelo
    const [animaisRes, eventosRes] = await Promise.all([
      supabase
        .from('animais')
        .select('id, nome, brinco, sexo, raca, data_nascimento, foto_url, status, finalidade, data_parto_previsto, prenhez, lotes_animais(nome, especie)')
        .eq('fazenda_id', faz.id)
        .eq('status', 'ativo')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),

      supabase
        .from('eventos_manejo')
        .select('animal_id, data, peso_medio_kg, tipo')
        .eq('fazenda_id', faz.id)
        .in('tipo', ['pesagem', 'parto'])
        .is('deleted_at', null)
        .order('data', { ascending: true }),
    ])

    const animaisData = (animaisRes.data as any[]) ?? []
    const eventosData = eventosRes.data ?? []
    setAnimais(animaisData)

    // ── Calcular indicadores ──────────────────────────────────────────────────
    const hoje    = new Date()
    const em7dias = new Date(); em7dias.setDate(hoje.getDate() + 7)
    const hojeStr = hoje.toISOString().split('T')[0]
    const em7Str  = em7dias.toISOString().split('T')[0]

    // Partos próximos (7 dias)
    const partosProximos = animaisData
      .filter(a => a.data_parto_previsto && a.data_parto_previsto >= hojeStr && a.data_parto_previsto <= em7Str)
      .map(a => ({ id: a.id, nome: a.nome, brinco: a.brinco, data: a.data_parto_previsto }))
      .sort((a, b) => a.data.localeCompare(b.data))

    // Finalidades presentes
    const temCorte = animaisData.some(a => a.finalidade === 'corte' || a.finalidade === 'dupla_aptidao')
    const temLeite = animaisData.some(a => a.finalidade === 'leite' || a.finalidade === 'dupla_aptidao')

    // GMD médio (corte/dupla) — últimas 2 pesagens por animal
    let gmdMedioCorte: number | null = null
    if (temCorte) {
      const animaisCorte = animaisData
        .filter(a => a.finalidade === 'corte' || a.finalidade === 'dupla_aptidao')
        .map(a => a.id)

      const gmds: number[] = []
      for (const animalId of animaisCorte) {
        const pesagens = eventosData
          .filter(e => e.animal_id === animalId && e.tipo === 'pesagem' && e.peso_medio_kg)
          .slice(-2)
        if (pesagens.length === 2) {
          const dias = (new Date(pesagens[1].data).getTime() - new Date(pesagens[0].data).getTime()) / 86400000
          if (dias > 0) {
            const gmd = (pesagens[1].peso_medio_kg - pesagens[0].peso_medio_kg) / dias
            if (gmd > 0) gmds.push(gmd)
          }
        }
      }
      gmdMedioCorte = gmds.length > 0 ? gmds.reduce((s, v) => s + v, 0) / gmds.length : null
    }

    // Taxa de prenhez (leite/dupla) — vacas prenhes / total fêmeas ativas
    let taxaPrenhez: number | null = null
    let iepMedio:    number | null = null
    let vacasLactacao = 0
    if (temLeite) {
      const femeasLeite = animaisData.filter(a =>
        (a.finalidade === 'leite' || a.finalidade === 'dupla_aptidao') && a.sexo === 'F'
      )
      const prenhes = femeasLeite.filter(a => a.prenhez === 'positivo').length
      taxaPrenhez = femeasLeite.length > 0 ? Math.round((prenhes / femeasLeite.length) * 100) : null

      // Vacas em lactação — tiveram parto nos últimos 305 dias
      const h305 = new Date(); h305.setDate(hoje.getDate() - 305)
      const h305Str = h305.toISOString().split('T')[0]
      const partosRecentes = new Set(
        eventosData
          .filter(e => e.tipo === 'parto' && e.data >= h305Str)
          .map(e => e.animal_id)
      )
      vacasLactacao = femeasLeite.filter(a => partosRecentes.has(a.id)).length

      // IEP médio — intervalo entre partos consecutivos por animal
      const ieps: number[] = []
      for (const animal of femeasLeite) {
        const partos = eventosData
          .filter(e => e.animal_id === animal.id && e.tipo === 'parto')
          .map(e => e.data)
          .sort()
        for (let i = 1; i < partos.length; i++) {
          const dias = (new Date(partos[i]).getTime() - new Date(partos[i - 1]).getTime()) / 86400000
          if (dias > 0) ieps.push(dias)
        }
      }
      iepMedio = ieps.length > 0 ? Math.round(ieps.reduce((s, v) => s + v, 0) / ieps.length) : null
    }

    setIndicadores({
      totalAnimais: animaisData.length,
      partosProximos,
      temCorte,
      gmdMedioCorte,
      temLeite,
      taxaPrenhez,
      iepMedio,
      vacasLactacao,
    })

    setLoading(false)
  }

  const animaisFiltrados = animais.filter(a => {
    const termo = busca.toLowerCase()
    const bate  = !busca ||
      a.nome?.toLowerCase().includes(termo) ||
      a.brinco?.toLowerCase().includes(termo) ||
      a.raca?.toLowerCase().includes(termo)
    const sexoOk = filtroSexo === 'todos' || a.sexo === filtroSexo
    return bate && sexoOk
  })

  if (loading) return (
    <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center">
      <p className="text-sm text-stone-500">Carregando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F2EB]">

      <header className="bg-[#2D5016] px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white transition">←</button>
          <Logo size={28} />
          <div>
            <p className="text-white font-semibold text-sm leading-none">Pecuária</p>
            <p className="text-white/60 text-xs mt-0.5">{animais.length} animais cadastrados</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/dashboard/pecuaria/novo')}
          className="bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
        >
          + Novo animal
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* ── Card de indicadores ── */}
        {indicadores && indicadores.totalAnimais > 0 && (
          <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="bg-amber-500 px-5 py-3">
              <p className="text-white font-semibold text-sm">📊 Indicadores do rebanho</p>
            </div>

            {/* Indicadores comuns */}
            <div className="px-5 pt-4 pb-2 grid grid-cols-2 gap-3">
              {/* Total de animais */}
              <button
                onClick={() => {}}
                className="bg-stone-50 rounded-xl p-3 text-left hover:bg-stone-100 transition"
              >
                <p className="text-2xl font-bold text-stone-800">{indicadores.totalAnimais}</p>
                <p className="text-xs text-stone-500 mt-0.5">Animais ativos</p>
              </button>

              {/* Partos próximos */}
              <button
                onClick={() => {
                  const el = document.getElementById('partos-proximos')
                  el?.scrollIntoView({ behavior: 'smooth' })
                }}
                className={`rounded-xl p-3 text-left transition ${
                  indicadores.partosProximos.length > 0
                    ? 'bg-amber-50 hover:bg-amber-100'
                    : 'bg-stone-50 hover:bg-stone-100'
                }`}
              >
                <p className={`text-2xl font-bold ${indicadores.partosProximos.length > 0 ? 'text-amber-600' : 'text-stone-800'}`}>
                  {indicadores.partosProximos.length}
                </p>
                <p className="text-xs text-stone-500 mt-0.5">Partos em 7 dias</p>
              </button>
            </div>

            {/* Indicadores de corte */}
            {indicadores.temCorte && (
              <div className="px-5 py-3 border-t border-stone-100">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">🥩 Corte</p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="bg-stone-50 rounded-xl p-3">
                    <p className="text-xl font-bold text-stone-800">
                      {indicadores.gmdMedioCorte !== null ? `${indicadores.gmdMedioCorte.toFixed(2)} kg/dia` : '—'}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">GMD médio do rebanho</p>
                    {indicadores.gmdMedioCorte === null && (
                      <p className="text-xs text-stone-400 mt-1">Registre ao menos 2 pesagens por animal</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Indicadores de leite */}
            {indicadores.temLeite && (
              <div className="px-5 py-3 border-t border-stone-100">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">🥛 Leite</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-stone-50 rounded-xl p-3">
                    <p className="text-xl font-bold text-stone-800">
                      {indicadores.taxaPrenhez !== null ? `${indicadores.taxaPrenhez}%` : '—'}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">Taxa de prenhez</p>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-3">
                    <p className="text-xl font-bold text-stone-800">
                      {indicadores.iepMedio !== null ? `${indicadores.iepMedio}d` : '—'}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">IEP médio</p>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-3">
                    <p className="text-xl font-bold text-stone-800">{indicadores.vacasLactacao}</p>
                    <p className="text-xs text-stone-500 mt-0.5">Em lactação</p>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de partos próximos */}
            {indicadores.partosProximos.length > 0 && (
              <div id="partos-proximos" className="px-5 py-3 border-t border-amber-100 bg-amber-50">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">🐄 Partos previstos nos próximos 7 dias</p>
                <div className="space-y-2">
                  {indicadores.partosProximos.map(p => (
                    <button
                      key={p.id}
                      onClick={() => router.push(`/dashboard/pecuaria/${p.id}`)}
                      className="w-full flex items-center justify-between bg-white rounded-lg px-3 py-2.5 hover:bg-amber-50 transition border border-amber-100"
                    >
                      <p className="text-sm font-medium text-stone-800">
                        {p.nome ?? p.brinco ?? 'Animal'}
                        {p.brinco && p.nome && <span className="text-stone-400 font-normal"> · #{p.brinco}</span>}
                      </p>
                      <p className="text-xs text-amber-600 font-semibold">{formatarData(p.data)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Busca e filtros */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Buscar por nome, brinco ou raça..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="flex-1 rounded-lg border border-stone-300 px-3.5 py-2.5 text-sm
              text-stone-900 placeholder:text-stone-400 outline-none
              focus:ring-2 focus:ring-[#2D5016]/25 focus:border-[#2D5016] bg-white"
          />
          <select
            value={filtroSexo}
            onChange={e => setFiltroSexo(e.target.value as any)}
            className="rounded-lg border border-stone-300 px-3 py-2.5 text-sm
              text-stone-700 outline-none focus:ring-2 focus:ring-[#2D5016]/25
              focus:border-[#2D5016] bg-white"
          >
            <option value="todos">Todos</option>
            <option value="M">Machos</option>
            <option value="F">Fêmeas</option>
          </select>
        </div>

        {/* Estado vazio */}
        {animais.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-10 text-center">
            <p className="text-4xl mb-3">🐄</p>
            <h2 className="text-base font-semibold text-stone-700 mb-1">Nenhum animal cadastrado</h2>
            <p className="text-sm text-stone-400 mb-5">Cadastre o primeiro animal da sua propriedade</p>
            <button
              onClick={() => router.push('/dashboard/pecuaria/novo')}
              className="bg-[#2D5016] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#3a6620] transition"
            >
              + Cadastrar primeiro animal
            </button>
          </div>
        )}

        {/* Lista de animais */}
        {animaisFiltrados.length > 0 && (
          <div className="flex flex-col gap-3">
            {animaisFiltrados.map(animal => (
              <button
                key={animal.id}
                onClick={() => router.push(`/dashboard/pecuaria/${animal.id}`)}
                className="bg-white rounded-xl border border-stone-200 overflow-hidden
                  text-left hover:shadow-md hover:border-amber-300 transition active:scale-95
                  flex items-center gap-4 p-3"
              >
                <div className="w-20 h-20 rounded-xl bg-amber-50 overflow-hidden shrink-0 relative">
                  {animal.foto_url ? (
                    <img src={animal.foto_url} alt={animal.nome ?? 'Animal'} className="w-full h-full object-cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl">{animal.sexo === 'M' ? '🐂' : '🐄'}</span>
                    </div>
                  )}
                  <span className={`absolute top-1 right-1 text-xs font-bold px-1 py-0.5 rounded-full
                    ${animal.sexo === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                    {animal.sexo === 'M' ? 'M' : 'F'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-800 truncate">
                    {animal.nome ?? animal.brinco ?? '—'}
                  </p>
                  {animal.brinco && animal.nome && (
                    <p className="text-xs text-stone-400">#{animal.brinco}</p>
                  )}
                  {animal.raca && (
                    <p className="text-xs text-stone-500 mt-0.5">{animal.raca}</p>
                  )}
                  {animal.data_nascimento && (
                    <p className="text-xs text-amber-600 mt-1 font-medium">
                      {calcularIdade(animal.data_nascimento)}
                    </p>
                  )}
                  <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-full font-medium
                    ${animal.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                    {animal.status}
                  </span>
                </div>
                <span className="text-stone-300 text-lg shrink-0">›</span>
              </button>
            ))}
          </div>
        )}

        {/* Sem resultados na busca */}
        {animais.length > 0 && animaisFiltrados.length === 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
            <p className="text-sm text-stone-400">Nenhum animal encontrado para "{busca}"</p>
          </div>
        )}

      </main>
    </div>
  )
}