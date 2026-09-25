FROM ghcr.io/railwayapp/nixpacks:ubuntu-1745885067

ENTRYPOINT ["/bin/bash", "-l", "-c"]
WORKDIR /app/


COPY .nixpacks/nixpkgs-23f9169c4ccce521379e602cc82ed873a1f1b52b.nix .nixpacks/nixpkgs-23f9169c4ccce521379e602cc82ed873a1f1b52b.nix
RUN nix-env -if .nixpacks/nixpkgs-23f9169c4ccce521379e602cc82ed873a1f1b52b.nix && nix-collect-garbage -d


ARG CI NIXPACKS_METADATA NODE_ENV NPM_CONFIG_PRODUCTION
ENV CI=$CI NIXPACKS_METADATA=$NIXPACKS_METADATA NODE_ENV=$NODE_ENV NPM_CONFIG_PRODUCTION=$NPM_CONFIG_PRODUCTION

# Next.js inlines NEXT_PUBLIC_* into the browser bundle at `next build`; the login page
# creates its Supabase client from them in the browser. Railway supplied them as build
# variables, dev2's compose build passes no build args, so the public values (they ship
# in every page's JavaScript anyway) are the defaults here. app.env still wins at runtime.
ARG NEXT_PUBLIC_SUPABASE_URL=https://sytajbytcdlsbnbkqpyo.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_McsKXzSA1weUTMUddMDgEQ_74LRMQ-4
ARG NEXT_PUBLIC_APP_URL=https://smshub.dev
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# setup phase
# noop

# install phase
ENV NIXPACKS_PATH=/app/node_modules/.bin:$NIXPACKS_PATH
COPY . /app/.
RUN --mount=type=cache,id=dbTkOGSg1YM-/root/local/share/pnpm/store/v3,target=/root/.local/share/pnpm/store/v3 npm install -g corepack@0.24.1 && corepack enable
RUN --mount=type=cache,id=dbTkOGSg1YM-/root/local/share/pnpm/store/v3,target=/root/.local/share/pnpm/store/v3 pnpm i --frozen-lockfile

# build phase
COPY . /app/.
RUN --mount=type=cache,id=dbTkOGSg1YM-next/cache,target=/app/.next/cache --mount=type=cache,id=dbTkOGSg1YM-node_modules/cache,target=/app/node_modules/.cache pnpm run build


RUN printf '\nPATH=/app/node_modules/.bin:$PATH' >> /root/.profile


# start
COPY . /app

CMD ["pnpm start"]

