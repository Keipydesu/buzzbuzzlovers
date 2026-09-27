Rails.application.routes.draw do
  root "dashboard#index"
  get "/api/demo", to: "dashboard#data"
  put "/api/demo/sessions/:id", to: "dashboard#snapshot"
  post "/api/demo/seed", to: "dashboard#seed"
  delete "/api/demo", to: "dashboard#reset"
end
