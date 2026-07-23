# FitControl — WorkControl

Sistema completo de controle de ordens de serviço, produção de máquinas, acompanhamento de tarefas e evidências fotográficas em tempo real.

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 19, TypeScript, TanStack Router, TanStack Query, Tailwind CSS v4, Lucide Icons, Shadcn UI
- **Backend / Banco de Dados**: Supabase (PostgreSQL, Auth, RLS, Storage Buckets)
- **Servidor Local**: Vite

## 🚀 Como Rodar o Projeto Localmente

1. Clone o repositório:
```bash
git clone https://github.com/kigutifenix-crypto/workcontrol.git
cd workcontrol
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o arquivo `.env`:
Crie um arquivo `.env` na raiz do projeto baseado no `.env.example`:
```env
VITE_SUPABASE_URL="https://qaigkeawaqcoafaquyni.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sua_publishable_key"
VITE_SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key"
```

4. Execute o servidor de desenvolvimento:
```bash
npm run dev
```

Acesse o sistema em **http://localhost:8080** no seu navegador ou dispositivo móvel na mesma rede.

## 📋 Funcionalidades

- **Dashboard Executivo**: Visão geral de produtividade, status de ordens de serviço e gráficos.
- **Minhas Tarefas**: Foco no trabalho do colaborador com envio de múltiplas fotos de evidência e botão flutuante para celular.
- **Quadro Kanban**: Gestão visual de tarefas por colunas de status, menu de ações rápidas e indicação clara do responsável.
- **Todas as Tarefas**: Tabela e grade interativa com busca em tempo real por título, máquina ou responsável.
- **Gestão de Usuários (Admin)**: Painel exclusivo para administradores criarem e editarem permissões de usuários.
- **Gestão de Máquinas**: Cadastro de equipamentos e busca automatizada por código e nome.
