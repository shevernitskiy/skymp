#pragma once
#include "TPOverlayService.h"

#include <RE/BSScript/IFunction.h>
#include <RE/BSScript/Internal/VirtualMachine.h>
#include <RE/BSTSmartPointer.h>
#include <functional>
#include <memory>

class SkyrimPlatform
{
public:
  static SkyrimPlatform& GetSingleton();

  void JsTick(bool gameFunctionsAvailable);
  void SetOverlayService(std::shared_ptr<OverlayService> overlayService);
  void AddTickTask(const std::function<void()>& f);
  void AddUpdateTask(const std::function<void()>& f);
  void PushAndWait(const std::function<void(int)>& task);
  void Push(const std::function<void(int)>& task);
  void PushToWorkerAndWait(
    RE::BSTSmartPointer<RE::BSScript::IFunction> fPtr,
    const RE::BSTSmartPointer<RE::BSScript::Stack>& stack,
    RE::BSScript::ErrorLogger* logger,
    RE::BSScript::Internal::VirtualMachine* vm,
    RE::BSScript::IFunction::CallResult* ret);
  void PrepareWorker();
  void StartWorker();
  void StopWorker();

private:
  SkyrimPlatform();
  struct Impl;
  std::shared_ptr<Impl> pImpl;
};
