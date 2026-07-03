'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const cadastroSchema = z.object({
  nome: z.string().min(2, 'Informe seu nome completo'),
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  senha: z.string().min(6, 'A senha deve ter ao menos 6 caracteres'),
  confirmarSenha: z.string(),
}).refine(d => d.senha === d.confirmarSenha, {
  message: 'As senhas não coincidem',
  path: ['confirmarSenha'],
})

type CadastroForm = z.infer<typeof cadastroSchema>

export default function CadastroPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [erro, setErro]             = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<CadastroForm>({
    resolver: zodResolver(cadastroSchema),
  })

  async function onSubmit(dados: CadastroForm) {
    setCarregando(true)
    setErro(null)

    const { data, error } = await supabase.auth.signUp({
      email:    dados.email,
      password: dados.senha,
      options: {
        data: { nome: dados.nome },
      },
    })

    if (error) {
      setErro('Não foi possível criar sua conta. Tente novamente.')
      setCarregando(false)
      return
    }

    if (data.user) {
      await supabase.from('profiles').insert({
        id:   data.user.id,
        nome: dados.nome,
      })
    }

    router.push('/onboarding')
  }

  const inputClass = (temErro: boolean) =>
    `w-full rounded-lg border px-3.5 py-2.5 text-sm text-stone-900
    placeholder:text-stone-400 outline-none transition
    focus:ring-2 focus:ring-[#2D5016]/25 focus:border-[#2D5016]
    ${temErro ? 'border-red-400 bg-red-50/50' : 'border-stone-300 hover:border-stone-400'}`

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#F5F2EB] px-4 py-12">

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
        <p className="text-sm text-[#5C7A45]">Gestão para o produtor rural</p>
      </div>

      <div className="w-full max-w-[360px] bg-white rounded-2xl border border-stone-200 shadow-sm px-8 py-8">
        <h2 className="text-base font-medium text-stone-800 mb-6">Criar sua conta</h2>

        {erro && (
          <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">

          <div className="flex flex-col gap-1.5">
            <label htmlFor="nome" className="text-sm font-medium text-stone-700">Nome completo</label>
            <input
              id="nome" type="text" autoComplete="name" placeholder="João da Silva"
              className={inputClass(!!errors.nome)}
              {...register('nome')}
            />
            {errors.nome && <p className="text-xs text-red-600">{errors.nome.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-stone-700">E-mail</label>
            <input
              id="email" type="email" autoComplete="email" placeholder="seu@email.com"
              className={inputClass(!!errors.email)}
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha" className="text-sm font-medium text-stone-700">Senha</label>
            <input
              id="senha" type="password" autoComplete="new-password" placeholder="••••••••"
              className={inputClass(!!errors.senha)}
              {...register('senha')}
            />
            {errors.senha && <p className="text-xs text-red-600">{errors.senha.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmarSenha" className="text-sm font-medium text-stone-700">Confirmar senha</label>
            <input
              id="confirmarSenha" type="password" autoComplete="new-password" placeholder="••••••••"
              className={inputClass(!!errors.confirmarSenha)}
              {...register('confirmarSenha')}
            />
            {errors.confirmarSenha && <p className="text-xs text-red-600">{errors.confirmarSenha.message}</p>}
          </div>

          <button
            type="submit" disabled={carregando}
            className="w-full rounded-lg bg-[#2D5016] text-white text-sm font-medium py-2.5 mt-1
              transition hover:bg-[#3a6620] active:scale-[.98]
              disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {carregando ? 'Criando conta...' : 'Criar conta grátis'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-200"/>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-stone-400">ou</span>
          </div>
        </div>

        <p className="text-center text-sm text-stone-500">
          Já tem conta?{' '}
          <a href="/auth/login" className="text-[#2D5016] font-medium hover:underline">
            Entrar
          </a>
        </p>
      </div>

      <p className="mt-10 text-xs text-stone-400 text-center">
        © {new Date().getFullYear()} Safra Sul · RS · SC · PR
      </p>
    </main>
  )
}