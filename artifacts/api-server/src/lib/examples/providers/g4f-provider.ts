export interface G4FResponse {
  provider: string;
  model: string;
  content: string;
}

export async function getG4FResponse(messages: { role: "user" | "assistant" | "system"; content: string }[], model: string): Promise<G4FResponse | null> {
  // Simulate G4F response
  return {
    provider: "g4f-demo",
    model: model,
    content: "Esta es una respuesta simulada de G4F",
  };
}