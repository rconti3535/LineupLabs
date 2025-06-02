import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

const createLeagueSchema = z.object({
  name: z.string().min(1, "League name is required"),
  type: z.enum(["Redraft", "Dynasty"]),
  numberOfTeams: z.number().min(6, "Minimum 6 teams").max(30, "Maximum 30 teams"),
  scoringFormat: z.enum(["5x5 Roto", "Points"]),
});

type CreateLeagueForm = z.infer<typeof createLeagueSchema>;

export default function CreateLeague() {
  const [currentStep, setCurrentStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<CreateLeagueForm>({
    resolver: zodResolver(createLeagueSchema),
    defaultValues: {
      name: "",
      type: "Redraft",
      numberOfTeams: 12,
      scoringFormat: "5x5 Roto",
    },
  });

  const createLeagueMutation = useMutation({
    mutationFn: async (data: CreateLeagueForm) => {
      const leagueData = {
        ...data,
        createdBy: user?.id,
        isPublic: false,
        maxTeams: data.numberOfTeams,
      };
      const response = await apiRequest("POST", "/api/leagues", leagueData);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "League Created!",
        description: "Your fantasy baseball league has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      setLocation("/");
    },
    onError: (error) => {
      toast({
        title: "Failed to create league",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = (data: CreateLeagueForm) => {
    createLeagueMutation.mutate(data);
  };

  const steps = [
    { number: 1, title: "League Name", description: "What would you like to call your league?" },
    { number: 2, title: "League Type", description: "Choose your league format" },
    { number: 3, title: "Team Count", description: "How many teams will participate?" },
    { number: 4, title: "Scoring", description: "Select your scoring format" },
  ];

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mb-6">
        <Button
          onClick={() => setLocation("/")}
          variant="ghost"
          className="text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
        
        <h1 className="text-2xl font-bold text-white mb-2">Create League</h1>
        <p className="text-gray-400">Step {currentStep} of 4</p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step) => (
            <div
              key={step.number}
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                currentStep >= step.number
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {currentStep > step.number ? <Check className="w-4 h-4" /> : step.number}
            </div>
          ))}
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          ></div>
        </div>
      </div>

      <Card className="gradient-card rounded-xl p-6 border-0">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white mb-2">
            {steps[currentStep - 1].title}
          </h2>
          <p className="text-gray-400">{steps[currentStep - 1].description}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Step 1: League Name */}
            {currentStep === 1 && (
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">League Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your league name"
                        className="sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Step 2: League Type */}
            {currentStep === 2 && (
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">League Type</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-3"
                      >
                        <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                          <RadioGroupItem value="Redraft" id="redraft" className="text-blue-400" />
                          <Label htmlFor="redraft" className="text-white cursor-pointer flex-1">
                            <div>
                              <div className="font-medium">Redraft</div>
                              <div className="text-sm text-gray-400">
                                Draft new teams each season
                              </div>
                            </div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                          <RadioGroupItem value="Dynasty" id="dynasty" className="text-blue-400" />
                          <Label htmlFor="dynasty" className="text-white cursor-pointer flex-1">
                            <div>
                              <div className="font-medium">Dynasty</div>
                              <div className="text-sm text-gray-400">
                                Keep players across multiple seasons
                              </div>
                            </div>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Step 3: Number of Teams */}
            {currentStep === 3 && (
              <FormField
                control={form.control}
                name="numberOfTeams"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Number of Teams</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="6"
                        max="30"
                        placeholder="12"
                        className="sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 12)}
                      />
                    </FormControl>
                    <div className="text-sm text-gray-400 mt-2">
                      Choose between 6 and 30 teams
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Step 4: Scoring Format */}
            {currentStep === 4 && (
              <FormField
                control={form.control}
                name="scoringFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Scoring Format</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-3"
                      >
                        <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                          <RadioGroupItem value="5x5 Roto" id="roto" className="text-blue-400" />
                          <Label htmlFor="roto" className="text-white cursor-pointer flex-1">
                            <div>
                              <div className="font-medium">5x5 Roto</div>
                              <div className="text-sm text-gray-400">
                                Traditional rotisserie scoring
                              </div>
                            </div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                          <RadioGroupItem value="Points" id="points" className="text-blue-400" />
                          <Label htmlFor="points" className="text-white cursor-pointer flex-1">
                            <div>
                              <div className="font-medium">Points</div>
                              <div className="text-sm text-gray-400">
                                Points-based scoring system
                              </div>
                            </div>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-4">
              <Button
                type="button"
                onClick={prevStep}
                variant="outline"
                className={`sleeper-card-bg sleeper-border border text-white hover:bg-gray-800 ${
                  currentStep === 1 ? "invisible" : ""
                }`}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              {currentStep < 4 ? (
                <Button
                  type="button"
                  onClick={nextStep}
                  className="primary-gradient hover:opacity-90"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={createLeagueMutation.isPending}
                  className="primary-gradient hover:opacity-90"
                >
                  {createLeagueMutation.isPending ? "Creating..." : "Create League"}
                  <Check className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}