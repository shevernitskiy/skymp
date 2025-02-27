#include "ConsoleApi.h"
#include "InGameConsolePrinter.h"
#include "InvalidArgumentException.h"
#include "NullPointerException.h"
#include "SkyrimPlatform.h"
#include "ThreadPoolWrapper.h"
#include "Validators.h"
#include "WindowsConsolePrinter.h"
#include <RE/CommandTable.h>
#include <RE/ConsoleLog.h>
#include <RE/Script.h>
#include <RE/TESForm.h>
#include <RE/TESObjectREFR.h>
#include <cstdlib>
#include <ctpl/ctpl_stl.h>
#include <fstream>
#include <iostream>
#include <map>
#include <skse64/ObScript.h>
#include <skse64_common/SafeWrite.h>
#include <vector>

namespace {
// TODO: Add printers switching
static std::shared_ptr<IConsolePrinter> g_printer(new InGameConsolePrinter);

struct ConsoleCommand
{
  std::string longName;
  std::string shortName;
  uint16_t numArgs = 0;
  ObScript_Execute execute;
  JsValue jsExecute;
  ObScriptCommand* myIter;
  ObScriptCommand myOriginalData;
};
static std::map<std::string, ConsoleCommand> replacedConsoleCmd;
static bool printConsolePrefixesEnabled = true;

bool AreCommandNamesValidAndEqual(const std::string& first,
                                  const std::string& second)
{
  return first.size() > 0 && second.size() > 0
    ? stricmp(first.data(), second.data()) == 0
    : false;
}
} // namespace

JsValue ConsoleApi::PrintConsole(const JsFunctionArguments& args)
{
  g_printer->Print(args);
  return JsValue::Undefined();
}

void ConsoleApi::Clear()
{
  for (auto& item : replacedConsoleCmd) {
    SafeWriteBuf((uintptr_t)item.second.myIter, &(item.second.myOriginalData),
                 sizeof(item.second.myOriginalData));
  }

  replacedConsoleCmd.clear();
}

const char* ConsoleApi::GetScriptPrefix()
{
  return printConsolePrefixesEnabled ? "[Script] " : "";
}

const char* ConsoleApi::GetExceptionPrefix()
{
  return printConsolePrefixesEnabled ? "[Exception] " : "";
}

namespace {
ConsoleCommand FillCmdInfo(ObScriptCommand* cmd)
{
  ConsoleCommand cmdInfo;

  cmdInfo.longName = cmd->longName;
  cmdInfo.shortName = cmd->shortName;
  cmdInfo.numArgs = cmd->numParams;
  cmdInfo.execute = cmd->execute;
  cmdInfo.myIter = cmd;
  cmdInfo.myOriginalData = *cmd;
  cmdInfo.jsExecute = JsValue::Function(
    [](const JsFunctionArguments& args) { return JsValue::Bool(true); });

  return cmdInfo;
}

void CreateLongNameProperty(JsValue& obj, ConsoleCommand* replaced)
{
  obj.SetProperty(
    "longName",
    [=](const JsFunctionArguments& args) {
      return JsValue::String(replaced->myIter->longName);
    },
    [=](const JsFunctionArguments& args) {
      replaced->longName = args[1].ToString();

      ObScriptCommand cmd = *replaced->myIter;
      cmd.longName = replaced->longName.c_str();

      SafeWriteBuf((uintptr_t)replaced->myIter, &cmd, sizeof(cmd));
      return JsValue::Undefined();
    });
}

void CreateShortNameProperty(JsValue& obj, ConsoleCommand* replaced)
{
  obj.SetProperty(
    "shortName",
    [=](const JsFunctionArguments& args) {
      return JsValue::String(replaced->myIter->shortName);
    },
    [=](const JsFunctionArguments& args) {
      replaced->shortName = args[1].ToString();

      ObScriptCommand cmd = *replaced->myIter;
      cmd.shortName = replaced->shortName.c_str();

      SafeWriteBuf((uintptr_t)replaced->myIter, &cmd, sizeof(cmd));
      return JsValue::Undefined();
    });
}

void CreateNumArgsProperty(JsValue& obj, ConsoleCommand* replaced)
{
  obj.SetProperty(
    "numArgs",
    [=](const JsFunctionArguments& args) {
      return JsValue::Double(replaced->myIter->numParams);
    },
    [=](const JsFunctionArguments& args) {
      replaced->numArgs = (double)args[1];

      ObScriptCommand cmd = *replaced->myIter;
      cmd.numParams = replaced->numArgs;

      SafeWriteBuf((uintptr_t)replaced->myIter, &cmd, sizeof(cmd));
      return JsValue::Undefined();
    });
}

void CreateExecuteProperty(JsValue& obj, ConsoleCommand* replaced)
{
  obj.SetProperty("execute", nullptr, [=](const JsFunctionArguments& args) {
    replaced->jsExecute = args[1];
    return JsValue::Undefined();
  });
}

struct ParseCommandResult
{
  std::string commandName;
  std::vector<std::string> params;
};

ParseCommandResult ParseCommand(std::string command)
{
  ParseCommandResult res;
  static const std::string delimiterComa = ".";
  static const std::string delimiterSpase = " ";
  std::string token;

  size_t pos = command.find(delimiterComa);
  if (pos != std::string::npos) {
    command.erase(0, pos + delimiterComa.length());
  }

  while ((pos = command.find(delimiterSpase)) != std::string::npos) {

    token = command.substr(0, pos);
    res.commandName.empty() ? res.commandName = token
                            : res.params.push_back(token);
    command.erase(0, pos + delimiterSpase.length());
  }

  if (command.size() >= 1)
    res.params.push_back(command);

  return res;
}

JsValue GetObject(const std::string& param)
{
  if (auto formByEditorId = RE::TESForm::LookupByEditorID(param))
    return JsValue::Double(formByEditorId->formID);

  auto id = strtoul(param.c_str(), nullptr, 16);

  if (auto formById = RE::TESForm::LookupByID(id))
    return JsValue::Double(formById->formID);

  auto err = "For param: " + param + " formId and editorId was not found";
  throw std::runtime_error(err.data());
}

JsValue GetTypedArg(RE::SCRIPT_PARAM_TYPE type, std::string param)
{
  switch (type) {
    case RE::SCRIPT_PARAM_TYPE::kStage:
    case RE::SCRIPT_PARAM_TYPE::kInt:
      return JsValue::Double((double)strtoll(param.c_str(), nullptr, 10));

    case RE::SCRIPT_PARAM_TYPE::kFloat:
      return JsValue::Double((double)strtod(param.c_str(), nullptr));

    case RE::SCRIPT_PARAM_TYPE::kCoontainerRef:
    case RE::SCRIPT_PARAM_TYPE::kInvObjectOrFormList:
    case RE::SCRIPT_PARAM_TYPE::kSpellItem:
    case RE::SCRIPT_PARAM_TYPE::kInventoryObject:
    case RE::SCRIPT_PARAM_TYPE::kPerk:
    case RE::SCRIPT_PARAM_TYPE::kActorBase:
    case RE::SCRIPT_PARAM_TYPE::kObjectRef:
      return JsValue::Double((double)strtoul(param.c_str(), nullptr, 16));

    case RE::SCRIPT_PARAM_TYPE::kAxis:
    case RE::SCRIPT_PARAM_TYPE::kActorValue:
    case RE::SCRIPT_PARAM_TYPE::kChar:
      return JsValue::String(param);

    default:
      return GetObject(param);
  }
}

bool ConsoleCommand_Execute(const ObScriptParam* paramInfo,
                            ScriptData* scriptData, TESObjectREFR* thisObj,
                            TESObjectREFR* containingObj, Script* scriptObj,
                            ScriptLocals* locals, double& result,
                            UInt32& opcodeOffsetPtr)
{
  std::pair<const std::string, ConsoleCommand>* iterator = nullptr;

  auto func = [&](int) {
    try {
      if (!scriptObj)
        throw NullPointerException("scriptObj");

      RE::Script* script = reinterpret_cast<RE::Script*>(scriptObj);

      std::string command = script->GetCommand();
      auto parseCommandResult = ParseCommand(command);

      for (auto& item : replacedConsoleCmd) {
        if (AreCommandNamesValidAndEqual(item.second.longName,
                                         parseCommandResult.commandName) ||
            AreCommandNamesValidAndEqual(item.second.shortName,
                                         parseCommandResult.commandName)) {

          std::vector<JsValue> args;
          args.push_back(JsValue::Undefined());
          auto refr = reinterpret_cast<RE::TESObjectREFR*>(thisObj);

          refr ? args.push_back(JsValue::Double((double)refr->formID))
               : args.push_back(JsValue::Double(0));

          auto param =
            reinterpret_cast<const RE::SCRIPT_PARAMETER*>(paramInfo);

          for (size_t i = 0; i < parseCommandResult.params.size(); ++i) {
            if (!param)
              break;

            JsValue arg =
              GetTypedArg(param[i].paramType, parseCommandResult.params[i]);

            if (arg.GetType() == JsValue::Type::Undefined) {
              auto err = " typeId " +
                std::to_string((uint32_t)param[i].paramType) +
                " not yet supported";

              throw std::runtime_error(err.data());
            }
            args.push_back(arg);
          }

          if (item.second.jsExecute.Call(args))
            iterator = &item;
          break;
        }
      }
    } catch (std::exception& e) {
      std::string what = e.what();
      SkyrimPlatform::GetSingleton().AddUpdateTask([what] {
        throw std::runtime_error(what + " (in ConsoleCommand_Execute)");
      });
    }
  };

  SkyrimPlatform::GetSingleton().PushAndWait(func);
  if (iterator)
    iterator->second.execute(paramInfo, scriptData, thisObj, containingObj,
                             scriptObj, locals, result, opcodeOffsetPtr);
  return true;
}

JsValue FindCommand(ObScriptCommand* iter, size_t size,
                    const std::string& commandName)
{
  for (size_t i = 0; i < size; ++i) {
    ObScriptCommand* _iter = &iter[i];

    if (AreCommandNamesValidAndEqual(_iter->longName, commandName) ||
        AreCommandNamesValidAndEqual(_iter->shortName, commandName)) {
      JsValue obj = JsValue::Object();

      auto& replaced = replacedConsoleCmd[commandName];
      replaced = FillCmdInfo(_iter);

      CreateLongNameProperty(obj, &replaced);
      CreateShortNameProperty(obj, &replaced);
      CreateNumArgsProperty(obj, &replaced);
      CreateExecuteProperty(obj, &replaced);

      ObScriptCommand cmd = *_iter;
      cmd.execute = ConsoleCommand_Execute;
      SafeWriteBuf((uintptr_t)_iter, &cmd, sizeof(cmd));
      return obj;
    }
  }
  return JsValue::Null();
}
} // namespace

JsValue ConsoleApi::FindConsoleCommand(const JsFunctionArguments& args)
{
  auto commandName = args[1].ToString();

  JsValue res = FindCommand(g_firstConsoleCommand,
                            kObScript_NumConsoleCommands, commandName);

  if (res.GetType() == JsValue::Type::Null)
    res = FindCommand(g_firstObScriptCommand, kObScript_NumObScriptCommands,
                      commandName);

  return res;
}

JsValue ConsoleApi::WriteLogs(const JsFunctionArguments& args)
{
  auto pluginName = args[1].ToString();
  if (!ValidateFilename(pluginName, /*allowDots*/ false)) {
    throw InvalidArgumentException("pluginName", pluginName);
  }

  static std::map<std::string, std::unique_ptr<std::ofstream>> g_m;

  if (!g_m[pluginName]) {
    g_m[pluginName] = std::make_unique<std::ofstream>(
      "Data\\Platform\\Logs\\" + pluginName + "-logs.txt");
  }

  std::string s;

  for (size_t i = 2; i < args.GetSize(); ++i) {
    JsValue str = args[i];
    if (args[i].GetType() == JsValue::Type::Object &&
        !args[i].GetExternalData()) {

      JsValue json = JsValue::GlobalObject().GetProperty("JSON");
      str = json.GetProperty("stringify").Call({ json, args[i] });
    }
    s += str.ToString() + ' ';
  }

  (*g_m[pluginName]) << s << std::endl;
  return JsValue::Undefined();
}

JsValue ConsoleApi::SetPrintConsolePrefixesEnabled(
  const JsFunctionArguments& args)
{
  printConsolePrefixesEnabled = static_cast<bool>(args[1]);
  return JsValue::Undefined();
}
