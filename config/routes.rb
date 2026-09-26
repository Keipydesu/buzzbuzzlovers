Rails.application.routes.draw do
  get "login", to: "logins#new"
  post "login", to: "logins#create"
  delete "logout", to: "logins#destroy"
  get "signup", to: "signups#new"
  post "signup", to: "signups#create"
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  root "dashboard#show"
  get "groups/join/:code", to: "group_invitations#show", as: :group_invitation
  post "groups/join", to: "group_invitations#create", as: :join_group
  resources :groups, only: %i[index create show] do
    delete :leave, on: :member
  end
  get "coach", to: "coach#show", as: :coach
  post "coach", to: "coach#create"

  namespace :api do
    namespace :v1 do
      resources :devices, only: %i[index create]

      get "devices/:device_id/session", to: "sessions#show",
        constraints: { device_id: /[0-9a-f]{32}/ }, as: :device_session

      put "devices/:device_id/sessions/:device_session_id/snapshot", to: "snapshots#update",
        constraints: { device_id: /[0-9a-f]{32}/, device_session_id: /\d+/ }, as: :device_session_snapshot

      get "today", to: "today#show"
      get "weekly", to: "weekly#show"
    end
  end
end
