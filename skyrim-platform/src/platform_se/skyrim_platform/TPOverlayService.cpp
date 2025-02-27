#include "TPOverlayService.h"
#include "TPRenderSystemD3D11.h"
#include <D3D11Hook.hpp>
#include <functional>
#include <ui/DX11RenderHandler.h>
#include <ui/MyChromiumApp.h>
#include <ui/MyRenderHandler.h>
#include <ui/ProcessMessageListener.h>
#include <ui/TextToDraw.h>

using CEFUtils::DX11RenderHandler;
using CEFUtils::MyRenderHandler;

struct D3D11RenderProvider final
  : MyChromiumApp::RenderProvider
  , DX11RenderHandler::Renderer
{
  explicit D3D11RenderProvider(RenderSystemD3D11* apRenderSystem)
    : m_pRenderSystem(apRenderSystem)
  {
  }

  MyRenderHandler* Create() override { return new DX11RenderHandler(this); }

  [[nodiscard]] HWND GetWindow() override
  {
    return m_pRenderSystem->GetWindow();
  }

  [[nodiscard]] IDXGISwapChain* GetSwapChain() const noexcept override
  {
    return m_pRenderSystem->GetSwapChain();
  }

private:
  RenderSystemD3D11* m_pRenderSystem;
};

OverlayService::OverlayService(
  std::shared_ptr<ProcessMessageListener> onProcessMessage_,
  const ObtainTextsToDrawFunction& obtainTextsToDraw_)
  : onProcessMessage(onProcessMessage_)
  , obtainTextsToDraw(obtainTextsToDraw_)
{
}

OverlayService::~OverlayService() noexcept
{
}

void OverlayService::Create(RenderSystemD3D11* apRenderSystem)
{
  auto renderProvider = std::make_unique<D3D11RenderProvider>(apRenderSystem);
  overlay = new MyChromiumApp(std::move(renderProvider), onProcessMessage);
  overlay->Initialize();
  overlay->GetClient()->Create();
}

void OverlayService::Render() const
{
  overlay->GetClient()->Render(obtainTextsToDraw);
}

void OverlayService::Reset() const
{
  overlay->GetClient()->Reset();
}
