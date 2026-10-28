package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"stockflow/internal"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	ctx := context.Background()

	// connec to database
	pool, err := internal.NewDBPool(ctx)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()
	log.Println("Connected to database")

	// setup router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	// register handlers and routes
	h := internal.NewHandler(pool)

	r.Route("/api", func(r chi.Router) {
		r.Get("/products", h.ListProducts)
		r.Post("/products", h.CreateProduct)
		r.Put("/products/{id}", h.UpdateProduct)
		r.Delete("/products/{id}", h.DeleteProduct)
	})

	// start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}