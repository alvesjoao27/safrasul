'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const onboardingSchema = z.object({
  nome:          z.string().min(2, 'Informe o nome da propriedade'),
  municipio:     z.string().min(2, 'Informe o município'),
  estado:        z.string().length(2, 'Selecione o estado'),
  area_total_ha: z.coerce.number().positive('Informe a área total').optional(),
  documento:     z.string().optional(),
  car:           z.string().optional(),
})

type OnboardingForm = z.infer<typeof onboardingSchema>

const ESTADOS_SUL = [
  { uf: 'RS', nome: 'Rio Grande do Sul' },
  { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'PR', nome: 'Paraná' },
]

export default function OnboardingPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [erro, setErro]             = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [etapa, setEtapa]           = useState<1 | 2>(1)

  const { register, handleSubmit, formState: { errors }, trigger } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
  })

  async function avancarEtapa() {
    const valido = await trigger(['nome', 'municipio', 'estado'])
    if (valido) setEtapa(2)
  }

  async function onSubmit(dados: OnboardingForm) {
    setCarregando(true)
    setErro(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth/login')
      return
    }

    const { error } = await supabase.from('fazendas').insert({
      owner_id:      user.id,
      nome:          dados.nome,
      municipio:     dados.municipio,
      estado:        dados.estado,
      area_total_ha: dados.area_total_ha || null,
      documento:     dados.documento || null,
      car:           dados.car || null,
    })

    if (error) {
      setErro('Não foi possível salvar sua propriedade. Tente novamente.')
      setCarregando(false)
      return
    }

    router.push('/dashboard')
  }

  const inputClass = (temErro: boolean) =>
    `w-full rounded-lg border px-3.5 py-2.5 text-sm text-stone-900
    placeholder:text-stone-400 outline-none transition
    focus:ring-2 focus:ring-[#2D5016]/25 focus:border-[#2D5016]
    ${temErro ? 'border-red-400 bg-red-50/50' : 'border-stone-300 hover:border-stone-400'}`

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#F5F2EB] px-4 py-12">

      {/* Logo */}
      <div className="flex flex-col items-center gap-2 mb-8">
        <svg width="52" height="52" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="24" fill="#2D5016"/>
          <line x1="18" y1="36" x2="28" y2="12" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="22" cy="26" r="2.5" fill="#fff"/>
          <circle cx="20" cy="21" r="2.5" fill="#fff"/>
          <circle cx="25" cy="17" r="2.5" fill="#fff"/>
          <line x1="30" y1="36" x2="20" y2="12" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="26" cy="26" r="2.5" fill="#fff"/>
          <circle cx="28" cy="21" r="2.5" fill="#fff"/>
          <circle cx="23" cy="17" r="2.5" fill="#fff"/>
        </svg>
        <h1 className="text-2xl font-semibold text-[#1E3A0F] tracking-tight">Safra Sul</h1>
      </div>

      {/* Card */}
      <div className="w-full max-w-[400px] bg-white rounded-2xl border border-stone-200 shadow-sm px-8 py-8">

        {/* Progresso */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`h-1.5 flex-1 rounded-full transition-all ${etapa >= 1 ? 'bg-[#2D5016]' : 'bg-stone-200'}`}/>
          <div className={`h-1.5 flex-1 rounded-full transition-all ${etapa >= 2 ? 'bg-[#2D5016]' : 'bg-stone-200'}`}/>
        </div>

        {etapa === 1 && (
          <>
            <div className="mb-6">
              <p className="text-xs text-[#5C7A45] font-medium mb-1">Passo 1 de 2</p>
              <h2 className="text-base font-medium text-stone-800">Sua propriedade</h2>
              <p className="text-sm text-stone-500 mt-1">Como se chama sua propriedade rural?</p>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nome" className="text-sm font-medium text-stone-700">
                  Nome da propriedade
                </label>
                <input
                  id="nome" type="text" placeholder="Ex: Sítio São João"
                  className={inputClass(!!errors.nome)}
                  {...register('nome')}
                />
                {errors.nome && <p className="text-xs text-red-600">{errors.nome.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="municipio" className="text-sm font-medium text-stone-700">
                  Município
                </label>
                <input
                  id="municipio" type="text" placeholder="Ex: Passo Fundo"
                  className={inputClass(!!errors.municipio)}
                  {...register('municipio')}
                />
                {errors.municipio && <p className="text-xs text-red-600">{errors.municipio.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="estado" className="text-sm font-medium text-stone-700">
                  Estado
                </label>
                <select
                  id="estado"
                  className={inputClass(!!errors.estado)}
                  defaultValue=""
                  {...register('estado')}
                >
                  <option value="" disabled>Selecione o estado</option>
                  {ESTADOS_SUL.map(e => (
                    <option key={e.uf} value={e.uf}>{e.nome}</option>
                  ))}
                </select>
                {errors.estado && <p className="text-xs text-red-600">{errors.estado.message}</p>}
              </div>

              <button
                type="button"
                onClick={avancarEtapa}
                className="w-full rounded-lg bg-[#2D5016] text-white text-sm font-medium py-2.5
                  transition hover:bg-[#3a6620] active:scale-[.98]"
              >
                Continuar
              </button>
            </div>
          </>
        )}

        {etapa === 2 && (
          <>
            <div className="mb-6">
              <p className="text-xs text-[#5C7A45] font-medium mb-1">Passo 2 de 2</p>
              <h2 className="text-base font-medium text-stone-800">Dados complementares</h2>
              <p className="text-sm text-stone-500 mt-1">Opcionais — você pode preencher depois.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="area_total_ha" className="text-sm font-medium text-stone-700">
                  Área total (hectares)
                </label>
                <input
                  id="area_total_ha" type="number" step="0.01" placeholder="Ex: 45.5"
                  className={inputClass(!!errors.area_total_ha)}
                  {...register('area_total_ha')}
                />
                {errors.area_total_ha && <p className="text-xs text-red-600">{errors.area_total_ha.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="documento" className="text-sm font-medium text-stone-700">
                  CPF / CNPJ
                </label>
                <input
                  id="documento" type="text" placeholder="Ex: 000.000.000-00"
                  className={inputClass(false)}
                  {...register('documento')}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="car" className="text-sm font-medium text-stone-700">
                  CAR <span className="text-stone-400 font-normal">(Cadastro Ambiental Rural)</span>
                </label>
                <input
                  id="car" type="text" placeholder="Ex: RS-4300000-XXXX..."
                  className={inputClass(false)}
                  {...register('car')}
                />
              </div>

              {erro && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{erro}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEtapa(1)}
                  className="flex-1 rounded-lg border border-stone-300 text-stone-700
                    text-sm font-medium py-2.5 transition hover:bg-stone-50"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={carregando}
                  className="flex-1 rounded-lg bg-[#2D5016] text-white text-sm font-medium py-2.5
                    transition hover:bg-[#3a6620] active:scale-[.98]
                    disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  {carregando ? 'Salvando...' : 'Começar'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <p className="mt-10 text-xs text-stone-400 text-center">
        © {new Date().getFullYear()} Safra Sul · RS · SC · PR
      </p>
    </main>
  )
}