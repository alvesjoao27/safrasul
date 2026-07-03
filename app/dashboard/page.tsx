'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Fazenda = { id: string; nome: string; municipio: string; estado: string }
type KPIs = { receitas: number; despesas: number; saldo: number }
type Safra = { id: string; nome: string; status: string; cultura?: { nome: string } }
type Alerta = { tipo: string; mensagem: string; urgencia: 'alta' | 'media' | 'baixa' }
type Clima = { temp: number; descricao: string; icon: string } | null

const MODULOS = [
  { href: '/dashboard/financeiro', emoji: '💰', nome: 'Financeiro',  cor: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { href: '/dashboard/lavoura',    emoji: '🌱', nome: 'Lavoura',     cor: 'bg-lime-50 border-lime-200 text-lime-700' },
  { href: '/dashboard/pecuaria',   emoji: '🐄', nome: 'Pecuária',    cor: 'bg-amber-50 border-amber-200 text-amber-700' },
  { href: '/dashboard/estoque',    emoji: '📦', nome: 'Estoque',     cor: 'bg-blue-50 border-blue-200 text-blue-700' },
  { href: '/dashboard/maquinario', emoji: '🚜', nome: 'Maquinário',  cor: 'bg-orange-50 border-orange-200 text-orange-700' },
  { href: '/dashboard/fazenda',    emoji: '🏡', nome: 'Propriedade', cor: 'bg-stone-50 border-stone-200 text-stone-700' },
]

const CUIDADOS_REBANHO = [
  { emoji: '💉', nome: 'Vacinação',     desc: 'Febre aftosa, brucelose, raiva' },
  { emoji: '🔬', nome: 'Prenhez',       desc: 'Diagnóstico de gestação' },
  { emoji: '⚖️', nome: 'Pesagem',       desc: 'Controle de ganho de peso' },
  { emoji: '🪱', nome: 'Vermifugação',  desc: 'Controle de parasitas' },
  { emoji: '🩺', nome: 'Tratamentos',   desc: 'Animais em observação' },
  { emoji: '🐄', nome: 'Partos',        desc: 'Previsão de partos' },
]

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
  const [kpis,     setKpis]     = useState<KPIs>({ receitas: 0, despesas: 0, saldo: 0 })
  const [safras,   setSafras]   = useState<Safra[]>([])
  const [alertas,  setAlertas]  = useState<Alerta[]>([])
  const [clima,    setClima]    = useState<Clima>(null)
  const [nomeUser, setNomeUser] = useState('')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: profile } = await supabase
      .from('profiles').select('nome').eq('id', user.id).single()
    if (profile) setNomeUser(profile.nome.split(' ')[0])

    const { data: faz } = await supabase
      .from('fazendas').select('id, nome, municipio, estado')
      .eq('owner_id', user.id).single()
    if (!faz) { router.push('/onboarding'); return }
    setFazenda(faz)

    const inicio = new Date(); inicio.setDate(1)
    const fim = new Date(); fim.setMonth(fim.getMonth() + 1); fim.setDate(0)
    const { data: lanc } = await supabase
      .from('lancamentos_financeiros').select('tipo, valor')
      .eq('fazenda_id', faz.id)
      .gte('data_competencia', inicio.toISOString().split('T')[0])
      .lte('data_competencia', fim.toISOString().split('T')[0])
      .neq('status', 'cancelado')

    if (lanc) {
      const rec = lanc.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0)
      const des = lanc.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0)
      setKpis({ receitas: rec, despesas: des, saldo: rec - des })
    }

    const { data: saf } = await supabase
      .from('safras').select('id, nome, status, culturas(nome)')
      .eq('fazenda_id', faz.id).eq('status', 'em_andamento').limit(4)
    if (saf) setSafras(saf as any)

    const { data: estoque } = await supabase
      .from('estoque_insumos').select('qtd_atual, qtd_minima, insumos(nome)')
      .eq('fazenda_id', faz.id)

    const alertasGerados: Alerta[] = []
    estoque?.forEach((e: any) => {
      if (e.qtd_minima && e.qtd_atual <= e.qtd_minima) {
        alertasGerados.push({
          tipo: 'estoque',
          mensagem: `Estoque baixo: ${e.insumos?.nome}`,
          urgencia: e.qtd_atual === 0 ? 'alta' : 'media',
        })
      }
    })

    const { data: manut } = await supabase
      .from('manutencoes').select('proxima_revisao_data, maquinarios(nome)')
      .eq('fazenda_id', faz.id)
      .lte('proxima_revisao_data', new Date().toISOString().split('T')[0])
    manut?.forEach((m: any) => {
      alertasGerados.push({
        tipo: 'maquinario',
        mensagem: `Revisão vencida: ${m.maquinarios?.nome}`,
        urgencia: 'alta',
      })
    })
    setAlertas(alertasGerados)

    try {
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(faz.municipio)}&country_code=BR&count=1`
      ).then(r => r.json())
      if (geo.results?.[0]) {
        const { latitude, longitude } = geo.results[0]
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

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const mesAtual = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

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
          <p className="text-sm text-stone-500 mt-0.5 capitalize">{mesAtual}</p>
        </div>

        <section>
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">
            Financeiro — {mesAtual}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-stone-400 mb-1">Receitas</p>
              <p className="text-sm font-semibold text-emerald-600">{fmt(kpis.receitas)}</p>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-stone-400 mb-1">Despesas</p>
              <p className="text-sm font-semibold text-red-500">{fmt(kpis.despesas)}</p>
            </div>
            <div className={`rounded-xl border p-4 ${kpis.saldo >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-stone-400 mb-1">Saldo</p>
              <p className={`text-sm font-semibold ${kpis.saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmt(kpis.saldo)}
              </p>
            </div>
          </div>
        </section>

        {alertas.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">⚠️ Alertas</h2>
            <div className="space-y-2">
              {alertas.map((a, i) => (
                <div key={i} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${a.urgencia === 'alta' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <span className="text-lg">{a.tipo === 'estoque' ? '📦' : '🚜'}</span>
                  <p className={`text-sm font-medium ${a.urgencia === 'alta' ? 'text-red-700' : 'text-amber-700'}`}>{a.mensagem}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">🌱 Safras em andamento</h2>
          {safras.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-stone-300 p-6 text-center">
              <p className="text-sm text-stone-400">Nenhuma safra em andamento</p>
              <a href="/dashboard/lavoura" className="text-xs text-[#2D5016] font-medium mt-1 inline-block hover:underline">Cadastrar safra →</a>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {safras.map(s => (
                <div key={s.id} className="bg-white rounded-xl border border-stone-200 p-4">
                  <p className="text-xs text-[#5C7A45] font-medium">{(s as any).culturas?.nome}</p>
                  <p className="text-sm font-semibold text-stone-800 mt-0.5">{s.nome}</p>
                  <span className="inline-block mt-2 text-xs bg-lime-100 text-lime-700 px-2 py-0.5 rounded-full">Em andamento</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">🐄 Cuidados com o rebanho</h2>
          <div className="grid grid-cols-3 gap-2">
            {CUIDADOS_REBANHO.map(c => (
              <a
                key={c.nome}
                href="/dashboard/pecuaria"
                className="bg-white rounded-xl border border-stone-200 p-3 text-center hover:border-[#2D5016]/30 hover:bg-[#2D5016]/5 transition"
              >
                <p className="text-2xl mb-1">{c.emoji}</p>
                <p className="text-xs font-semibold text-stone-700">{c.nome}</p>
                <p className="text-xs text-stone-400 mt-0.5 leading-tight">{c.desc}</p>
              </a>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Módulos</h2>
          <div className="grid grid-cols-3 gap-3">
            {MODULOS.map(m => (
              <a
                key={m.href}
                href={m.href}
                className={`rounded-xl border p-4 text-center transition hover:shadow-sm active:scale-95 ${m.cor}`}
              >
                <p className="text-2xl mb-1">{m.emoji}</p>
                <p className="text-xs font-semibold">{m.nome}</p>
              </a>
            ))}
          </div>
        </section>

        {fazenda && (
          <p className="text-center text-xs text-stone-400 pb-4">
            📍 {fazenda.municipio} · {fazenda.estado}
          </p>
        )}

      </main>
    </div>
  )
}