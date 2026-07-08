'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Fazenda = { id: string; nome: string; municipio: string; estado: string }

type DiaPrevisao = {
  data:      string
  diaSemana: string
  tempMax:   number
  tempMin:   number
  descricao: string
  icon:      string
  probChuva: number
  mmChuva:   number
}

type Clima = {
  temp:      number
  descricao: string
  icon:      string
  umidade:   number
  nascer:    string
  poente:    string
  previsao:  DiaPrevisao[]
} | null

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

function getClimatempoUrl(municipio: string, estado: string): string {
  const q = encodeURIComponent(`${municipio} ${estado} climatempo`)
  return `https://www.google.com/search?q=${q}`
}

function condicaoTempo(code: number): { descricao: string; icon: string } {
  const desc = code <= 1 ? 'Céu limpo' : code <= 3 ? 'Parcialmente nublado' : code <= 48 ? 'Nublado' : code <= 67 ? 'Chuva' : 'Tempestade'
  const icon = code <= 1 ? '☀️' : code <= 3 ? '⛅' : code <= 48 ? '☁️' : code <= 67 ? '🌧️' : '⛈️'
  return { descricao: desc, icon }
}

const Logo = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
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

// ─── Card de módulo com linha assinatura ──────────────────────────────────────
function ModCard({
  href, cor, children
}: {
  href: string
  cor: string
  children: React.ReactNode
}) {
  return (
    <a href={href}
      className="block bg-[#FAFAF8] rounded-2xl border border-[#E5E0D8] overflow-hidden
        hover:shadow-md transition active:scale-[.99]">
      <div className="h-[3px]" style={{ background: cor }}/>
      {children}
    </a>
  )
}

// ─── Stat box interno ─────────────────────────────────────────────────────────
function StatBox({ valor, label, corValor }: { valor: React.ReactNode; label: string; corValor?: string }) {
  return (
    <div className="bg-[#F0EDE6] rounded-xl p-3">
      <p className={`text-2xl font-bold leading-none ${corValor ?? 'text-[#1C2B0E]'}`}>{valor}</p>
      <p className="text-[10px] font-medium text-stone-400 mt-1.5 uppercase tracking-wide">{label}</p>
    </div>
  )
}

export default function DashboardPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [fazenda,    setFazenda]    = useState<Fazenda | null>(null)
  const [resumo,     setResumo]     = useState<Resumo | null>(null)
  const [clima,      setClima]      = useState<Clima>(null)
  const [nomeUser,   setNomeUser]   = useState('')
  const [emailUser,  setEmailUser]  = useState('')
  const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [menuAberto, setMenuAberto] = useState(false)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const [profileRes, fazRes] = await Promise.all([
      supabase.from('profiles').select('nome, avatar_url').eq('id', user.id).single(),
      supabase.from('fazendas').select('id, nome, municipio, estado').eq('owner_id', user.id).single(),
    ])

    if (profileRes.data) {
      setNomeUser(profileRes.data.nome.split(' ')[0])
      setAvatarUrl(profileRes.data.avatar_url ?? null)
    }
    setEmailUser(user.email ?? '')

    if (!fazRes.data && !fazRes.error) { router.push('/onboarding'); return }
    if (!fazRes.data) { setLoading(false); return }

    const faz = fazRes.data
    setFazenda(faz)

    const inicio = new Date(); inicio.setDate(1)
    const fim    = new Date(); fim.setMonth(fim.getMonth() + 1); fim.setDate(0)
    const hoje   = new Date().toISOString().split('T')[0]

    const [animaisRes, safrasRes, lancRes, estoqueRes, manutRes, climaRes] = await Promise.all([
      supabase.from('animais').select('id', { count: 'exact', head: true }).eq('fazenda_id', faz.id).is('deleted_at', null),
      supabase.from('safras').select('id', { count: 'exact', head: true }).eq('fazenda_id', faz.id).eq('status', 'em_andamento'),
      supabase.from('lancamentos_financeiros').select('tipo, valor').eq('fazenda_id', faz.id)
        .gte('data_competencia', inicio.toISOString().split('T')[0])
        .lte('data_competencia', fim.toISOString().split('T')[0])
        .neq('status', 'cancelado'),
      supabase.from('estoque_insumos').select('qtd_atual, qtd_minima, insumos(nome)').eq('fazenda_id', faz.id),
      supabase.from('manutencoes').select('proxima_revisao_data, maquinarios(nome)').eq('fazenda_id', faz.id).lte('proxima_revisao_data', hoje),
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(faz.municipio)}&country_code=BR&count=1`).then(r => r.json()).catch(() => null),
    ])

    const lanc = lancRes.data ?? []
    const rec  = lanc.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0)
    const des  = lanc.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0)

    const alertas: Resumo['alertas'] = []
    estoqueRes.data?.forEach((e: any) => {
      if (e.qtd_minima && e.qtd_atual <= e.qtd_minima)
        alertas.push({ mensagem: `Estoque baixo: ${e.insumos?.nome}`, urgencia: e.qtd_atual === 0 ? 'alta' : 'media' })
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

    try {
      if (climaRes?.results?.[0]) {
        const { latitude, longitude } = climaRes.results[0]
        const w = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,weathercode,relative_humidity_2m` +
          `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,precipitation_sum,sunrise,sunset` +
          `&timezone=America/Sao_Paulo&forecast_days=6`
        ).then(r => r.json())

        const atual   = condicaoTempo(w.current?.weathercode)
        const temp    = Math.round(w.current?.temperature_2m)
        const umidade = w.current?.relative_humidity_2m ?? 0
        const fmtHora = (iso: string) => iso?.slice(11, 16) ?? '--:--'
        const nascer  = fmtHora(w.daily?.sunrise?.[0])
        const poente  = fmtHora(w.daily?.sunset?.[0])

        const previsao: DiaPrevisao[] = (w.daily?.time ?? []).slice(1, 6).map((data: string, i: number) => {
          const idx  = i + 1
          const cond = condicaoTempo(w.daily.weathercode[idx])
          return {
            data,
            diaSemana: new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
            tempMax:   Math.round(w.daily.temperature_2m_max[idx]),
            tempMin:   Math.round(w.daily.temperature_2m_min[idx]),
            probChuva: w.daily.precipitation_probability_max?.[idx] ?? 0,
            mmChuva:   Math.round((w.daily.precipitation_sum?.[idx] ?? 0) * 10) / 10,
            ...cond,
          }
        })

        setClima({ temp, descricao: atual.descricao, icon: atual.icon, umidade, nascer, poente, previsao })
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
    <div className="min-h-screen bg-[#F0EDE6] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-pulse w-10 h-10 rounded-full bg-[#2D5016]/20"/>
        <p className="text-sm text-stone-400 font-medium">Carregando...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F0EDE6]">

      {/* ── Header ── */}
      <header className="bg-[#2D5016] px-4 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Safra Sul</p>
            <p className="text-white/50 text-[11px] leading-tight">{fazenda?.nome}</p>
          </div>
        </div>

        <div className="relative">
          <button onClick={() => setMenuAberto(v => !v)} className="hover:opacity-80 transition">
            {avatarUrl ? (
              <img src={avatarUrl} alt={nomeUser} className="w-8 h-8 rounded-full object-cover border-2 border-white/25"/>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/25 flex items-center justify-center">
                <span className="text-white text-sm font-bold">{nomeUser?.[0]?.toUpperCase() ?? '?'}</span>
              </div>
            )}
          </button>

          {menuAberto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)}/>
              <div className="absolute right-0 top-11 z-20 w-56 bg-[#FAFAF8] rounded-xl shadow-lg border border-[#E5E0D8] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#E5E0D8]">
                  <p className="text-sm font-semibold text-[#1C2B0E] truncate">{nomeUser}</p>
                  <p className="text-xs text-stone-400 truncate mt-0.5">{emailUser}</p>
                </div>
                <div className="py-1">
                  <a href="/dashboard/perfil" onClick={() => setMenuAberto(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#1C2B0E] hover:bg-[#EBF2E3] transition">
                    <span>👤</span> Meu perfil
                  </a>
                  <a href="/dashboard/fazenda" onClick={() => setMenuAberto(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#1C2B0E] hover:bg-[#EBF2E3] transition">
                    <span>🏡</span> Minha propriedade
                  </a>
                  <div className="border-t border-[#E5E0D8] mt-1 pt-1">
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition">
                      <span>↩️</span> Sair
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* ── Saudação ── */}
        <div className="pt-1">
          <h1 className="text-[22px] font-bold text-[#1C2B0E] tracking-tight leading-tight">
            {saudacao}, {nomeUser}! 👋
          </h1>
          <p className="text-[11px] font-medium text-stone-400 mt-1 uppercase tracking-wide">
            {fazenda?.municipio} · {fazenda?.estado}
          </p>
        </div>

        {/* ── Alertas ── */}
        {resumo && resumo.alertas.length > 0 && (
          <section className="space-y-2">
            {resumo.alertas.map((a, i) => (
              <div key={i} className={`rounded-xl border px-4 py-3 flex items-center gap-3
                ${a.urgencia === 'alta' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <span>⚠️</span>
                <p className={`text-sm font-medium ${a.urgencia === 'alta' ? 'text-red-700' : 'text-amber-700'}`}>
                  {a.mensagem}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* ── Clima ── */}
        {clima && clima.previsao.length > 0 && fazenda && (
          <button
            onClick={() => window.open(getClimatempoUrl(fazenda.municipio, fazenda.estado), '_blank')}
            className="w-full text-left bg-[#FAFAF8] rounded-2xl border border-[#E5E0D8] overflow-hidden
              hover:shadow-md hover:border-[#2D5016]/30 transition active:scale-[.99]"
          >
            {/* Barra assinatura verde */}
            <div className="h-[3px] bg-gradient-to-r from-[#2D5016] to-[#5A8A30]"/>
            {/* Cabeçalho */}
            <div className="px-4 py-3 bg-[#2D5016]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{clima.icon}</span>
                  <div>
                    <p className="text-white font-semibold text-sm leading-none">
                      {clima.temp}°C · {clima.descricao}
                    </p>
                    <p className="text-white/50 text-[10px] mt-0.5">Agora</p>
                  </div>
                </div>
                <span className="text-white/50 text-[10px]">Ver no Google →</span>
              </div>
              <div className="mt-2.5 flex items-center gap-4">
                <span className="text-white/70 text-[10px]">💧 {clima.umidade}%</span>
                <span className="text-white/70 text-[10px]">🌅 {clima.nascer}</span>
                <span className="text-white/70 text-[10px]">🌇 {clima.poente}</span>
              </div>
            </div>
            {/* Previsão */}
            <div className="px-3 py-3 grid grid-cols-5 divide-x divide-[#E5E0D8]">
              {clima.previsao.map(dia => (
                <div key={dia.data} className="flex flex-col items-center gap-0.5 text-center px-1">
                  <p className="text-[10px] font-medium text-stone-400 capitalize">{dia.diaSemana}</p>
                  <p className="text-lg leading-none my-0.5">{dia.icon}</p>
                  <p className="text-[11px] font-semibold text-[#1C2B0E]">{dia.tempMax}°</p>
                  <p className="text-[10px] text-stone-400">{dia.tempMin}°</p>
                  {dia.mmChuva > 0
                    ? <p className="text-[9px] text-[#2D5016] font-semibold mt-0.5">{dia.mmChuva}mm</p>
                    : <p className="text-[9px] text-stone-300 mt-0.5">—</p>
                  }
                </div>
              ))}
            </div>
          </button>
        )}

        {/* ── Estado vazio ── */}
        {!temAlgo && (
          <section className="bg-[#FAFAF8] rounded-2xl border border-dashed border-[#E5E0D8] p-8 text-center">
            <p className="text-4xl mb-3">🌱</p>
            <h2 className="text-base font-semibold text-[#1C2B0E] mb-1">Bem-vindo ao Safra Sul!</h2>
            <p className="text-sm text-stone-400 mb-6">Por onde você quer começar?</p>
            <div className="flex flex-col gap-3">
              <a href="/dashboard/pecuaria"
                className="bg-[#EBF2E3] border border-[#2D5016]/20 text-[#2D5016] rounded-xl px-4 py-3 text-sm font-medium hover:bg-[#d8eccc] transition">
                🐄 Cadastrar animais
              </a>
              <a href="/dashboard/lavoura"
                className="bg-[#EBF2E3] border border-[#2D5016]/20 text-[#2D5016] rounded-xl px-4 py-3 text-sm font-medium hover:bg-[#d8eccc] transition">
                🌱 Cadastrar safra
              </a>
              <a href="/dashboard/financeiro"
                className="bg-[#EBF2E3] border border-[#2D5016]/20 text-[#2D5016] rounded-xl px-4 py-3 text-sm font-medium hover:bg-[#d8eccc] transition">
                💰 Lançar receita ou despesa
              </a>
            </div>
          </section>
        )}

        {/* ── Card Pecuária ── */}
        {resumo?.temAnimais && (
          <ModCard href="/dashboard/pecuaria" cor="linear-gradient(90deg, #2D5016, #5A8A30)">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EBF2E3] flex items-center justify-center text-base">🐄</div>
                  <p className="text-sm font-semibold text-[#1C2B0E]">Pecuária</p>
                </div>
                <span className="text-[11px] font-medium text-[#2D5016]">Ver tudo →</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatBox valor={resumo.totalAnimais} label="Animais ativos"/>
                <StatBox valor="—" label="Partos em 7 dias" corValor="text-[#D97706]"/>
              </div>
            </div>
          </ModCard>
        )}

        {/* ── Card Lavoura ── */}
        {resumo?.temSafras && (
          <ModCard href="/dashboard/lavoura" cor="linear-gradient(90deg, #3D6B1F, #86EFAC)">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EBF2E3] flex items-center justify-center text-base">🌱</div>
                  <p className="text-sm font-semibold text-[#1C2B0E]">Lavoura</p>
                </div>
                <span className="text-[11px] font-medium text-[#2D5016]">Ver tudo →</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatBox valor={resumo.safrasAtivas} label="Safras em andamento"/>
                <StatBox valor="—" label="Atividades pendentes" corValor="text-[#3D6B1F]"/>
              </div>
            </div>
          </ModCard>
        )}

        {/* ── Card Financeiro ── */}
        {resumo?.temLancamentos && (
          <ModCard href="/dashboard/financeiro" cor="linear-gradient(90deg, #065F46, #34D399)">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#D1FAE5] flex items-center justify-center text-base">💰</div>
                  <p className="text-sm font-semibold text-[#1C2B0E]">Financeiro</p>
                </div>
                <span className="text-[11px] font-medium text-[#065F46]">Ver tudo →</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatBox valor={<span className="text-base">{fmt(resumo.receitas)}</span>} label="Receitas" corValor="text-[#065F46]"/>
                <StatBox valor={<span className="text-base">{fmt(resumo.despesas)}</span>} label="Despesas" corValor="text-red-600"/>
                <StatBox
                  valor={<span className="text-base">{fmt(resumo.saldoMes)}</span>}
                  label="Saldo do mês"
                  corValor={resumo.saldoMes >= 0 ? 'text-[#065F46]' : 'text-red-600'}
                />
              </div>
            </div>
          </ModCard>
        )}

        {/* ── Acesso rápido ── */}
        {temAlgo && (
          <section>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-3">Acesso rápido</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { href: '/dashboard/estoque',    emoji: '📦', nome: 'Estoque' },
                { href: '/dashboard/maquinario', emoji: '🚜', nome: 'Maquinário' },
                { href: '/dashboard/fazenda',    emoji: '🏡', nome: 'Propriedade' },
              ].map(m => (
                <a key={m.href} href={m.href}
                  className="bg-[#FAFAF8] rounded-xl border border-[#E5E0D8] p-4 text-center
                    hover:bg-[#EBF2E3] hover:border-[#2D5016]/20 transition active:scale-95">
                  <p className="text-2xl mb-1.5">{m.emoji}</p>
                  <p className="text-[11px] font-semibold text-[#1C2B0E]">{m.nome}</p>
                </a>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}