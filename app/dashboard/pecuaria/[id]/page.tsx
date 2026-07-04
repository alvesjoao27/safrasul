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
  lotes_animais: { nome: string; especie: string } | null
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

export default function PecuariaPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [animais,  setAnimais]  = useState<Animal[]>([])
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [busca,    setBusca]    = useState('')
  const [filtroSexo, setFiltroSexo] = useState<'todos' | 'M' | 'F'>('todos')

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: faz } = await supabase
      .from('fazendas').select('id')
      .eq('owner_id', user.id).single()
    if (!faz) { router.push('/onboarding'); return }
    setFazendaId(faz.id)

    const { data } = await supabase
      .from('animais')
      .select('id, nome, brinco, sexo, raca, data_nascimento, foto_url, status, lotes_animais(nome, especie)')
      .eq('fazenda_id', faz.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    setAnimais((data as any) ?? [])
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

      {/* Header */}
      <header className="bg-[#2D5016] px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white transition">
            ← 
          </button>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {animaisFiltrados.map(animal => (
              <button
                key={animal.id}
                onClick={() => router.push(`/dashboard/pecuaria/${animal.id}`)}
                className="bg-white rounded-xl border border-stone-200 overflow-hidden
                  text-left hover:shadow-md hover:border-amber-300 transition active:scale-95"
              >
                {/* Foto */}
                <div className="aspect-square bg-amber-50 relative overflow-hidden">
                  {animal.foto_url ? (
                    <img
                      src={animal.foto_url}
                      alt={animal.nome ?? 'Animal'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl">
                        {animal.sexo === 'M' ? '🐂' : '🐄'}
                      </span>
                    </div>
                  )}
                  {/* Badge sexo */}
                  <span className={`absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-full
                    ${animal.sexo === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                    {animal.sexo === 'M' ? 'M' : 'F'}
                  </span>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-sm font-semibold text-stone-800 truncate">
                    {animal.nome ?? animal.brinco ?? '—'}
                  </p>
                  {animal.brinco && animal.nome && (
                    <p className="text-xs text-stone-400 truncate">#{animal.brinco}</p>
                  )}
                  {animal.raca && (
                    <p className="text-xs text-stone-500 mt-0.5 truncate">{animal.raca}</p>
                  )}
                  {animal.data_nascimento && (
                    <p className="text-xs text-amber-600 mt-1 font-medium">
                      {calcularIdade(animal.data_nascimento)}
                    </p>
                  )}
                  <span className={`inline-block mt-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium
                    ${animal.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                    {animal.status}
                  </span>
                </div>
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