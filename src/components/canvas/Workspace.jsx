import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Text, Rect, Image as KonvaImage, Transformer, Group } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

const CanvasImage = ({ layerProps, isSelected, onSelect, onChange }) => {
  const [image] = useImage(layerProps.src);
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  // Apply filters if needed
  useEffect(() => {
    if (image && shapeRef.current) {
      if (layerProps.brightness !== 0) {
        shapeRef.current.clearCache();
        shapeRef.current.cache();
      } else {
        shapeRef.current.clearCache();
      }
    }
  }, [image, layerProps.brightness, layerProps.width, layerProps.height]);

  const { cropX, cropY, cropWidth, cropHeight, keepRatio, ...safeProps } = layerProps;

  return (
    <>
      <KonvaImage
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...safeProps}
        image={image}
        draggable
        filters={layerProps.brightness !== 0 ? [Konva.Filters.Brighten] : []}
        brightness={layerProps.brightness || 0}
        onDragEnd={(e) => {
          onChange({
            ...layerProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...layerProps,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          keepRatio={layerProps.keepRatio !== false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
};

const CanvasCode = ({ layerProps, isSelected, onSelect, onChange }) => {
  const [dataUrl, setDataUrl] = useState('');
  const [image] = useImage(dataUrl);
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    const generateCode = async () => {
      const text = layerProps.text || '123456';
      if (layerProps.codeType === 'qrcode') {
        try {
          const url = await QRCode.toDataURL(text, { width: 300, margin: 1 });
          setDataUrl(url);
        } catch (e) { console.error(e); }
      } else if (layerProps.codeType === 'barcode') {
        try {
          const canvas = document.createElement('canvas');
          JsBarcode(canvas, text, { 
            format: 'CODE128', 
            displayValue: layerProps.showText !== false, 
            margin: 10, 
            width: 2, 
            height: 100 
          });
          setDataUrl(canvas.toDataURL('image/png'));
        } catch (e) { console.error(e); }
      }
    };
    generateCode();
  }, [layerProps.text, layerProps.codeType, layerProps.showText]);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <KonvaImage
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...layerProps}
        image={image}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...layerProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...layerProps,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
};

const CanvasShape = ({ layerProps, isSelected, onSelect, onChange }) => {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Rect
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...layerProps}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...layerProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...layerProps,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
};

const CanvasText = ({ layerProps, isSelected, onSelect, onChange }) => {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Text
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...layerProps}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...layerProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          // Scale font size instead of width/height
          onChange({
            ...layerProps,
            x: node.x(),
            y: node.y(),
            fontSize: node.fontSize() * scaleX,
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
};

const CanvasTag = ({ layerProps, isSelected, onSelect, onChange }) => {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Group
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        x={layerProps.x}
        y={layerProps.y}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...layerProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...layerProps,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, (layerProps.width || 200) * scaleX),
            height: Math.max(5, (layerProps.height || 100) * scaleY),
          });
        }}
      >
        <Rect
          width={layerProps.width || 200}
          height={layerProps.height || 100}
          fill={layerProps.bgFill || '#FFFFFF'}
          stroke={layerProps.stroke || 'transparent'}
          strokeWidth={layerProps.strokeWidth || 0}
          cornerRadius={8}
        />
        <Text
          text={layerProps.text}
          fontSize={layerProps.fontSize || 60}
          fontFamily={layerProps.fontFamily || 'Inter'}
          fill={layerProps.fill || '#FFFFFF'}
          width={layerProps.width || 200}
          height={layerProps.height || 100}
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
};

export default function Workspace({ dimensions, zoom, setZoom, stagePos, setStagePos, layers, selectedId, setSelectedId, updateLayer, onPreview, previewRunner }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Export event listener
  useEffect(() => {
    const handleExport = () => {
      if (!stageRef.current) return;
      setSelectedId(null); // Deselect to hide transformers
      setTimeout(() => {
        const dataURL = stageRef.current.toDataURL({ pixelRatio: 1 });
        if (onPreview) {
          onPreview(dataURL);
        } else {
          const link = document.createElement('a');
          link.download = 'bib-canvas-export.png';
          link.href = dataURL;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }, 100);
    };
    window.addEventListener('export-canvas', handleExport);
    return () => window.removeEventListener('export-canvas', handleExport);
  }, [setSelectedId, onPreview]);

  const checkDeselect = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'bg';
    if (clickedOnEmpty) {
      setSelectedId(null);
    }
  };

  return (
    <div className="card" ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#e0e0e0', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      
      {/* Zoom / Pan Controls wrapper */}
      <div 
        style={{
          width: '100%',
          height: '100%',
          overflow: 'auto',
          position: 'relative',
          padding: '2rem'
        }}
      >
        <div style={{
          width: dimensions.width * zoom,
          height: dimensions.height * zoom,
          margin: '0 auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          background: 'white',
          position: 'relative'
        }}>
          <Stage
            width={dimensions.width * zoom}
            height={dimensions.height * zoom}
            scaleX={zoom}
            scaleY={zoom}
            onMouseDown={checkDeselect}
            onTouchStart={checkDeselect}
            ref={stageRef}
          >
            <Layer>
              <Rect
                x={0}
                y={0}
                width={dimensions.width}
                height={dimensions.height}
                fill="#ffffff"
                name="bg"
              />
              {layers.map((layer) => {
                // Apply preview runner if exists
                let renderLayer = { ...layer };
                if (previewRunner) {
                  if (renderLayer.type === 'text' || renderLayer.type === 'code') {
                    if (renderLayer.text) {
                      renderLayer.text = renderLayer.text
                        .replace(/{NAME}/g, previewRunner.name || '')
                        .replace(/{BIB}/g, previewRunner.bib || '')
                        .replace(/{CAT}/g, previewRunner.cat || '')
                        .replace(/{GENDER}/g, previewRunner.gender || '')
                        .replace(/{AGE}/g, previewRunner.age || '')
                        .replace(/{NAT}/g, previewRunner.nat || '');
                    }
                  }
                }

                if (layer.type === 'text') {
                  return (
                    <CanvasText
                      key={layer.id}
                      layerProps={renderLayer}
                      isSelected={layer.id === selectedId}
                      onSelect={() => setSelectedId(layer.id)}
                      onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
                    />
                  );
                }
                if (layer.type === 'rect') {
                  return (
                    <CanvasShape
                      key={layer.id}
                      layerProps={renderLayer}
                      isSelected={layer.id === selectedId}
                      onSelect={() => setSelectedId(layer.id)}
                      onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
                    />
                  );
                }
                if (layer.type === 'image') {
                  return (
                    <CanvasImage
                      key={layer.id}
                      layerProps={renderLayer}
                      isSelected={layer.id === selectedId}
                      onSelect={() => setSelectedId(layer.id)}
                      onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
                    />
                  );
                }
                if (layer.type === 'code') {
                  return (
                    <CanvasCode
                      key={layer.id}
                      layerProps={renderLayer}
                      isSelected={layer.id === selectedId}
                      onSelect={() => setSelectedId(layer.id)}
                      onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
                    />
                  );
                }
                if (layer.type === 'tag') {
                  return (
                    <CanvasTag
                      key={layer.id}
                      layerProps={layer}
                      isSelected={layer.id === selectedId}
                      onSelect={() => setSelectedId(layer.id)}
                      onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
                    />
                  );
                }
                return null;
              })}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
