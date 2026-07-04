'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Fazenda = { id: string; nome: string; municipio: string; estado: string }
type Clima   = { temp: number; descricao: string; icon: string } | null

type Resumo = {
  temAnimais:     boolean
  totalAnimais:   number
  temSafras:      boolean
  safrasAtivas:   number
  temLancamentos: boolean
  saldoMes:       number
  receitas:       number
  despesas:       number
  alertas:        { mensagem: string; urgencia: 'alta' | 'media' }[]
}

const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="24" fill={size > 35 ? '#2D5016' : 'rgba(255,255,255,0.15)'}/>
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

export default function DashboardPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [fazenda,  setFazenda]  = useState<Fazenda | null>(null)
  const [resumo,   setResumo]   = useState<Resumo | null>(null)
  const [clima,    setClima]    = useState<Clima>(null)
  const [nomeUser, setNomeUser] = useState('')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    // 1. Autenticação — necessária antes de tudo
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // 2. Perfil e fazenda em paralelo
    const [profileRes, fazRes] = await Promise.all([
      supabase.from('profiles').select('nome').eq('id', user.id).single(),
      supabase.from('fazendas').select('id, nome, municipio, estado').eq('owner_id', user.id).single(),
    ])

    if (profileRes.data) setNomeUser(profileRes.data.nome.split(' ')[0])
    if (!fazRes.data)    { router.push('/onboarding'); return }

    const faz = fazRes.data
    setFazenda(faz)

    // 3. Datas do mês atual
    const inicio = new Date(); inicio.setDate(1)
    const fim    = new Date(); fim.setMonth(fim.getMonth() + 1); fim.setDate(0)
    const hoje   = new Date().toISOString().split('T')[0]

    // 4. Todas as queries de dados + clima em paralelo
    const [
      animaisRes,
      safrasRes,
      lancRes,
      estoqueRes,
      manutRes,
      climaRes,
    ] = await Promise.all([
      supabase.from('animais')
        .select('id', { count: 'exact', head: true })
        .eq('fazenda_id', faz.id)
        .is('deleted_at', null),

      supabase.from('safras')
        .select('id', { count: 'exact', head: true })
        .eq('fazenda_id', faz.id)
        .eq('status', 'em_andamento'),

      supabase.from('lancamentos_financeiros')
        .select('tipo, valor')
        .eq('fazenda_id', faz.id)
        .gte('data_competencia', inicio.toISOString().split('T')[0])
        .lte('data_competencia', fim.toISOString().split('T')[0])
        .neq('status', 'cancelado'),

      supabase.from('estoque_insumos')
        .select('qtd_atual, qtd_minima, insumos(nome)')
        .eq('fazenda_id', faz.id),

      supabase.from('manutencoes')
        .select('proxima_revisao_data, maquinarios(nome)')
        .eq('fazenda_id', faz.id)
        .lte('proxima_revisao_data', hoje),

      // Clima em paralelo com o banco — não bloqueia o carregamento
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(faz.municipio)}&country_code=BR&count=1`)
        .then(r => r.json())
        .catch(() => null),
    ])

    // 5. Processa financeiro
    const lanc = lancRes.data ?? []
    const rec  = lanc.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0)
    const des  = lanc.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0)

    // 6. Processa alertas
    const alertas: Resumo['alertas'] = []
    estoqueRes.data?.forEach((e: any) => {
      if (e.qtd_minima && e.qtd_atual <= e.qtd_minima)
        alertas.push({
          mensagem: `Estoque baixo: ${e.insumos?.nome}`,
          urgencia: e.qtd_atual === 0 ? 'alta' : 'media',
        })
    })
    manutRes.data?.forEach((m: any) =>
      alertas.push({ mensagem: `Revisão vencida: ${m.maquinarios?.nome}`, urgencia: 'alta' })
    )

    setResumo({
      temAnimais:     (animaisRes.count ?? 0) > 0,
      totalAnimais:   animaisRes.count ?? 0,
      temSafras:      (safrasRes.count ?? 0) > 0,
      safrasAtivas:   safrasRes.count ?? 0,
      temLancamentos: lanc.length > 0,
      saldoMes:       rec - des,
      receitas:       rec,
      despesas:       des,
      alertas,
    })

    // 7. Processa clima (não bloqueia — já veio em paralelo)
    try {
      if (climaRes?.results?.[0]) {
        const { latitude, longitude } = climaRes.results[0]
        const w = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&timezone=America/Sao_Paulo`
        ).then(r => r.json())
        const code = w.current?.weathercode
        const temp = Math.round(w.current?.temperature_2m)
        const desc = code <= 1 ? 'Céu limpo' : code <= 3 ? 'Parcialmente nublado' : code <= 48 ? 'Nublado' : code <= 67 ? 'Chuva' : 'Tempestade'
        const icon = code <= 1 ? '☀️' : code <= 3 ? '⛅' : code <= 48 ? '☁️' : code <= 67 ? '🌧️' : '⛈️'
        setClima({ temp, descricao: desc, icon })
      }
    } catch {}

    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const fmt      = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const hora     = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const temAlgo  = resumo && (resumo.temAnimais || resumo.temSafras || resumo.temLancamentos)

  if (loading) return (
    <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-pulse"><Logo size={40} /></div>
        <p className="text-sm text-stone-500">Carregando...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F2EB]">

      <header className="bg-[#2D5016] px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <div>
            <p className="text-white font-semibold text-sm leading-none">Safra Sul</p>
            <p className="text-white/60 text-xs mt-0.5">{fazenda?.nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {clima && (
            <div className="text-right">
              <p className="text-white text-sm font-medium">{clima.icon} {clima.temp}°C</p>
              <p className="text-white/60 text-xs">{clima.descricao}</p>
            </div>
          )}
          <button onClick={handleLogout} className="text-white/60 hover:text-white text-xs transition">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div>
          <h1 className="text-xl font-semibold text-[#1E3A0F]">{saudacao}, {nomeUser}! 👋</h1>
          <p className="text-sm text-stone-500 mt-0.5">{fazenda?.municipio} · {fazenda?.estado}</p>
        </div>

        {resumo && resumo.alertas.length > 0 && (
          <section className="space-y-2">
            {resumo.alertas.map((a, i) => (
              <div key={i} className={`rounded-xl border px-4 py-3 flex items-center gap-3
                ${a.urgencia === 'alta' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <span className="text-lg">⚠️</span>
                <p className={`text-sm font-medium ${a.urgencia === 'alta' ? 'text-red-700' : 'text-amber-700'}`}>
                  {a.mensagem}
                </p>
              </div>
            ))}
          </section>
        )}

        {!temAlgo && (
          <section className="bg-white rounded-2xl border border-dashed border-stone-300 p-8 text-center">
            <p className="text-3xl mb-3">🌱</p>
            <h2 className="text-base font-semibold text-stone-700 mb-1">Bem-vindo ao Safra Sul!</h2>
            <p className="text-sm text-stone-400 mb-6">Por onde você quer começar?</p>
            <div className="flex flex-col gap-3">
              <a href="/dashboard/pecuaria"
                className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm font-medium hover:bg-amber-100 transition">
                🐄 Cadastrar animais
              </a>
              <a href="/dashboard/lavoura"
                className="bg-lime-50 border border-lime-200 text-lime-700 rounded-xl px-4 py-3 text-sm font-medium hover:bg-lime-100 transition">
                🌱 Cadastrar safra
              </a>
              <a href="/dashboard/financeiro"
                className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium hover:bg-emerald-100 transition">
                💰 Lançar receita ou despesa
              </a>
            </div>
          </section>
        )}

        {resumo?.temAnimais && (
          <a href="/dashboard/pecuaria"
            className="block bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-md transition active:scale-[.99]">
            <div className="bg-amber-500 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🐄</span>
                <p className="text-white font-semibold text-sm">Pecuária</p>
              </div>
              <span className="text-white/80 text-xs">Ver tudo →</span>
            </div>
            <div className="px-5 py-4 grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-stone-800">{resumo.totalAnimais}</p>
                <p className="text-xs text-stone-400 mt-0.5">Animais</p>
              </div>
              <div className="text-center border-x border-stone-100">
                <p className="text-2xl font-bold text-amber-600">—</p>
                <p className="text-xs text-stone-400 mt-0.5">Eventos hoje</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-stone-800">—</p>
                <p className="text-xs text-stone-400 mt-0.5">Pendências</p>
              </div>
            </div>
            <div className="px-5 pb-4 flex gap-2 flex-wrap">
              {['Vacinação', 'Prenhez', 'Pesagem', 'Partos'].map(t => (
                <span key={t} className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-full">
                  {t}
                </span>
              ))}
            </div>
          </a>
        )}

        {resumo?.temSafras && (
          <a href="/dashboard/lavoura"
            className="block bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-md transition active:scale-[.99]">
            <div className="bg-lime-600 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🌱</span>
                <p className="text-white font-semibold text-sm">Lavoura</p>
              </div>
              <span className="text-white/80 text-xs">Ver tudo →</span>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-stone-800">{resumo.safrasAtivas}</p>
                <p className="text-xs text-stone-400 mt-0.5">Safras em andamento</p>
              </div>
              <div className="text-center border-l border-stone-100">
                <p className="text-2xl font-bold text-lime-600">—</p>
                <p className="text-xs text-stone-400 mt-0.5">Atividades pendentes</p>
              </div>
            </div>
          </a>
        )}

        {resumo?.temLancamentos && (
          <a href="/dashboard/financeiro"
            className="block bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-md transition active:scale-[.99]">
            <div className="bg-emerald-700 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💰</span>
                <p className="text-white font-semibold text-sm">Financeiro</p>
              </div>
              <span className="text-white/80 text-xs">Ver tudo →</span>
            </div>
            <div className="px-5 py-4 grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-sm font-bold text-emerald-600">{fmt(resumo.receitas)}</p>
                <p className="text-xs text-stone-400 mt-0.5">Receitas</p>
              </div>
              <div className="text-center border-x border-stone-100">
                <p className="text-sm font-bold text-red-500">{fmt(resumo.despesas)}</p>
                <p className="text-xs text-stone-400 mt-0.5">Despesas</p>
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${resumo.saldoMes >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmt(resumo.saldoMes)}
                </p>
                <p className="text-xs text-stone-400 mt-0.5">Saldo do mês</p>
              </div>
            </div>
          </a>
        )}

        {temAlgo && (
          <section>
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Acesso rápido</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { href: '/dashboard/estoque',    emoji: '📦', nome: 'Estoque',     cor: 'bg-blue-50 border-blue-200 text-blue-700' },
                { href: '/dashboard/maquinario', emoji: '🚜', nome: 'Maquinário',  cor: 'bg-orange-50 border-orange-200 text-orange-700' },
                { href: '/dashboard/fazenda',    emoji: '🏡', nome: 'Propriedade', cor: 'bg-stone-50 border-stone-200 text-stone-700' },
              ].map(m => (
                <a key={m.href} href={m.href}
                  className={`rounded-xl border p-4 text-center transition hover:shadow-sm active:scale-95 ${m.cor}`}>
                  <p className="text-2xl mb-1">{m.emoji}</p>
                  <p className="text-xs font-semibold">{m.nome}</p>
                </a>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}